import AVFoundation
import Foundation

// Run on macOS with Xcode's swiftc alongside VideoTimeline.swift. No camera or account is used.
@main
struct TimelineChecks {
    static func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
        if !condition() { throw NSError(domain: "TimelineChecks", code: 1,
                                        userInfo: [NSLocalizedDescriptionKey: message]) }
    }

    static func main() async throws {
        let times = (0..<481).map { CMTime(value: Int64($0 + 1200), timescale: 240) }
        let verifiedFps = try VideoTimeline.validate(times: times, nominalFps: 240)
        try require(abs(verifiedFps - 240) < 1e-8,
                    "Expected 240 FPS")
        var dropped = times
        dropped.remove(at: 200)
        for invalid in [dropped, [times[0], times[0]], Array(times.reversed()), [CMTime.invalid, times[1]]] {
            do {
                _ = try VideoTimeline.validate(times: invalid, nominalFps: 240)
                throw NSError(domain: "TimelineChecks", code: 2,
                              userInfo: [NSLocalizedDescriptionKey: "Invalid timeline was accepted"])
            } catch let error as NSError where error.domain == "BallWiseLab.Timing" {}
        }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("reference-240.mov")
        try await writeVideo(url: url, fps: 240, skip: nil)
        let timeline = try VideoTimeline.read(url: url)
        try require(timeline.frameTimes.count == 481, "Frame count must come from samples")
        try require(abs(timeline.observedFps - 240) < 1e-5, "Measured FPS differs from known clock")
        let elapsed = CMTimeSubtract(timeline.frameTimes[220], timeline.frameTimes[100]).seconds
        try require(abs(elapsed - 0.5) < 1e-9, "Expected a half-second measurement")
        let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = .zero
        for index in [0, 1, 100, 220, 480] {
            var actual = CMTime.invalid
            _ = try generator.copyCGImage(at: timeline.frameTimes[index], actualTime: &actual)
            try require(CMTimeCompare(actual, timeline.frameTimes[index]) == 0,
                        "Image generator returned a different frame at index \(index)")
        }
        let missingURL = directory.appendingPathComponent("missing-frame.mov")
        try await writeVideo(url: missingURL, fps: 240, skip: 200)
        do {
            _ = try VideoTimeline.read(url: missingURL)
            throw NSError(domain: "TimelineChecks", code: 3,
                          userInfo: [NSLocalizedDescriptionKey: "Dropped frame file was accepted"])
        } catch let error as NSError where error.domain == "BallWiseLab.Timing" {}
        print("PASS: reference MOV, 481 real samples, 240 FPS, 0.5 s interval, exact first/last images, dropped and invalid frames")
    }

    static func writeVideo(url: URL, fps: Int32, skip: Int?) async throws {
        let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: 64, AVVideoHeightKey: 64,
            AVVideoCompressionPropertiesKey: [AVVideoExpectedSourceFrameRateKey: fps,
                                              AVVideoMaxKeyFrameIntervalKey: 30]
        ])
        input.mediaTimeScale = fps
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input,
            sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
                                          kCVPixelBufferWidthKey as String: 64,
                                          kCVPixelBufferHeightKey as String: 64])
        writer.add(input)
        try require(writer.startWriting(), "Writer did not start")
        writer.startSession(atSourceTime: .zero)
        for index in 0..<481 where index != skip {
            while !input.isReadyForMoreMediaData {
                if writer.status == .failed { throw writer.error! }
                try await Task.sleep(nanoseconds: 1_000_000)
            }
            var pixel: CVPixelBuffer?
            CVPixelBufferCreate(kCFAllocatorDefault, 64, 64, kCVPixelFormatType_32ARGB, nil, &pixel)
            guard let pixel else { throw NSError(domain: "TimelineChecks", code: 4) }
            CVPixelBufferLockBaseAddress(pixel, [])
            memset(CVPixelBufferGetBaseAddress(pixel), Int32(index % 255), CVPixelBufferGetBytesPerRow(pixel) * 64)
            CVPixelBufferUnlockBaseAddress(pixel, [])
            try require(adaptor.append(pixel, withPresentationTime: CMTime(value: Int64(index), timescale: fps)),
                        "Cannot append sample")
        }
        input.markAsFinished()
        await writer.finishWriting()
        try require(writer.status == .completed, "Movie was not written")
    }
}
