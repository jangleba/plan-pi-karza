import AVFoundation
import Foundation

struct VideoTimeline {
    let frameTimes: [CMTime]
    let nominalFps: Double
    let observedFps: Double
    let durationSeconds: Double
    let width: Int
    let height: Int

    static func read(url: URL) throws -> VideoTimeline {
        let asset = AVURLAsset(url: url)
        guard let track = asset.tracks(withMediaType: .video).first else {
            throw failure("Film nie zawiera ścieżki wideo.")
        }
        let reader = try AVAssetReader(asset: asset)
        // Read sample timing without decoding and retaining thousands of pixel buffers.
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
        output.alwaysCopiesSampleData = false
        guard reader.canAdd(output) else { throw failure("Nie można odczytać osi czasu filmu.") }
        reader.add(output)
        guard reader.startReading() else { throw reader.error ?? failure("Nie można odczytać filmu.") }
        var times: [CMTime] = []
        while let sample = output.copyNextSampleBuffer() {
            for index in 0..<CMSampleBufferGetNumSamples(sample) {
                var timing = CMSampleTimingInfo()
                guard CMSampleBufferGetSampleTimingInfo(sample, at: index, timingInfoOut: &timing) == noErr,
                      timing.presentationTimeStamp.isNumeric else {
                    reader.cancelReading()
                    throw failure("Film zawiera nieprawidłowy czas klatki.")
                }
                times.append(timing.presentationTimeStamp)
            }
        }
        guard reader.status == .completed else {
            throw reader.error ?? failure("Nie odczytano całego filmu.")
        }
        // Compressed samples can be returned in decode order (B-frames).
        times.sort { CMTimeCompare($0, $1) < 0 }
        let fps = try validate(times: times, nominalFps: Double(track.nominalFrameRate))
        let duration = track.timeRange.duration.seconds
        let dimensions = track.naturalSize.applying(track.preferredTransform)
        guard duration.isFinite, duration > 0,
              dimensions.width.isFinite, dimensions.height.isFinite,
              abs(dimensions.width) >= 1, abs(dimensions.height) >= 1,
              times.last!.seconds - times[0].seconds <= duration + 1e-9 else {
            throw failure("Nieprawidłowe dane nagrania.")
        }
        return VideoTimeline(frameTimes: times, nominalFps: Double(track.nominalFrameRate),
                             observedFps: fps, durationSeconds: duration,
                             width: Int(abs(dimensions.width).rounded()),
                             height: Int(abs(dimensions.height).rounded()))
    }

    static func validate(times: [CMTime], nominalFps: Double) throws -> Double {
        guard times.count > 1, nominalFps.isFinite, nominalFps >= 239, nominalFps <= 1000 else {
            throw failure("Nagranie nie ma wymaganego 240 FPS.")
        }
        var gaps: [Double] = []
        for (index, time) in times.enumerated() {
            guard time.isNumeric, time.seconds.isFinite, time.seconds >= 0 else {
                throw failure("Film zawiera nieprawidłowy czas klatki.")
            }
            if index > 0 {
                let gap = CMTimeSubtract(time, times[index - 1]).seconds
                guard gap > 0 else { throw failure("Film zawiera powtórzone lub odwrócone klatki.") }
                gaps.append(gap)
            }
        }
        let sorted = gaps.sorted()
        let middle = sorted.count / 2
        let median = sorted.count % 2 == 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
        guard sorted.last! <= median * 1.5 + 1e-9 else {
            throw failure("Nagranie zawiera brakujące klatki. Nagraj próbę ponownie.")
        }
        let observed = Double(times.count - 1) / CMTimeSubtract(times.last!, times[0]).seconds
        guard observed.isFinite, observed >= 239 - 1e-6, observed <= 1000 else {
            throw failure("Rzeczywista częstotliwość nagrania jest niższa niż 239 FPS.")
        }
        return observed
    }

    private static func failure(_ message: String) -> NSError {
        NSError(domain: "BallWiseLab.Timing", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
