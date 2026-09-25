import AVFoundation
import Capacitor
import Foundation
import UIKit

@objc(BallWiseCameraPlugin)
public final class BallWiseCameraPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BallWiseCameraPlugin"
    public let jsName = "BallWiseCamera"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "capabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "record", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "frameAt", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteVideo", returnType: CAPPluginReturnPromise)
    ]

    private let worker = DispatchQueue(label: "app.ballwise.camera.worker", qos: .userInitiated)

    @objc public func capabilities(_ call: CAPPluginCall) {
        worker.async {
            guard let selection = HighSpeedCameraViewController.best240FPSFormat() else {
                call.resolve([
                    "supported": false,
                    "fps": 0,
                    "width": 0,
                    "height": 0,
                    "camera": "back",
                    "reason": "Ten iPhone nie udostępnia tylnej kamery w trybie 240 FPS."
                ])
                return
            }

            call.resolve([
                "supported": true,
                "fps": selection.fps,
                "width": selection.width,
                "height": selection.height,
                "camera": "back"
            ])
        }
    }

    @objc public func record(_ call: CAPPluginCall) {
        let requested = call.getDouble("maxDurationSeconds") ?? 20
        let maximumDuration = min(max(requested, 2), 60)

        authorizeCamera { [weak self] granted in
            guard let self else { return }
            guard granted else {
                call.reject("BallWise potrzebuje dostępu do kamery, aby nagrywać testy 240 FPS.", "CAMERA_PERMISSION_DENIED")
                return
            }
            guard HighSpeedCameraViewController.best240FPSFormat() != nil else {
                call.reject("Ten iPhone nie udostępnia tylnej kamery w trybie 240 FPS.", "FPS_240_UNAVAILABLE")
                return
            }

            DispatchQueue.main.async {
                guard let host = self.bridge?.viewController else {
                    call.reject("Nie można otworzyć natywnego ekranu kamery.", "CAMERA_UI_UNAVAILABLE")
                    return
                }

                let controller = HighSpeedCameraViewController(maximumDuration: maximumDuration) { outcome in
                    switch outcome {
                    case .success(let capture):
                        call.resolve([
                            "path": capture.url.path,
                            "fps": capture.fps,
                            "width": capture.width,
                            "height": capture.height,
                            "durationSeconds": capture.durationSeconds,
                            "frameCount": capture.frameCount,
                            "codec": capture.codec
                        ])
                    case .cancelled:
                        call.reject("Nagrywanie anulowane.", "CAPTURE_CANCELLED")
                    case .failure(let message):
                        call.reject(message, "CAPTURE_FAILED")
                    }
                }
                controller.modalPresentationStyle = .fullScreen
                host.present(controller, animated: true)
            }
        }
    }

    @objc public func frameAt(_ call: CAPPluginCall) {
        guard let path = call.getString("path"),
              let url = allowedVideoURL(path: path) else {
            call.reject("Nieprawidłowa ścieżka filmu.", "INVALID_VIDEO_PATH")
            return
        }

        let frameIndex = max(call.getInt("frameIndex") ?? 0, 0)
        let maxWidth = min(max(call.getInt("maxWidth") ?? 1280, 320), 1920)

        worker.async {
            let asset = AVURLAsset(url: url)
            guard let track = asset.tracks(withMediaType: .video).first else {
                call.reject("Film nie zawiera ścieżki wideo.", "VIDEO_TRACK_MISSING")
                return
            }

            let fps = Double(track.nominalFrameRate)
            guard fps >= 239 else {
                call.reject("Film nie ma zweryfikowanych 240 FPS.", "INVALID_CAPTURE_FPS")
                return
            }

            let seconds = Double(frameIndex) / fps
            guard seconds <= asset.duration.seconds + (1.0 / fps) else {
                call.reject("Wybrana klatka jest poza filmem.", "FRAME_OUT_OF_RANGE")
                return
            }

            let generator = AVAssetImageGenerator(asset: asset)
            generator.appliesPreferredTrackTransform = true
            generator.requestedTimeToleranceBefore = .zero
            generator.requestedTimeToleranceAfter = .zero
            generator.maximumSize = CGSize(width: maxWidth, height: maxWidth * 2)

            var actualTime = CMTime.zero
            do {
                let image = try generator.copyCGImage(
                    at: CMTime(seconds: seconds, preferredTimescale: 60_000),
                    actualTime: &actualTime
                )
                guard let jpeg = UIImage(cgImage: image).jpegData(compressionQuality: 0.9) else {
                    call.reject("Nie można zakodować klatki.", "FRAME_ENCODING_FAILED")
                    return
                }
                call.resolve([
                    "dataUrl": "data:image/jpeg;base64,\(jpeg.base64EncodedString())",
                    "requestedFrame": frameIndex,
                    "actualTimeSeconds": actualTime.seconds
                ])
            } catch {
                call.reject("Nie można odczytać dokładnej klatki: \(error.localizedDescription)", "FRAME_EXTRACTION_FAILED")
            }
        }
    }

    @objc public func deleteVideo(_ call: CAPPluginCall) {
        guard let path = call.getString("path"),
              let url = allowedVideoURL(path: path) else {
            call.reject("Nieprawidłowa ścieżka filmu.", "INVALID_VIDEO_PATH")
            return
        }

        worker.async {
            do {
                if FileManager.default.fileExists(atPath: url.path) {
                    try FileManager.default.removeItem(at: url)
                }
                call.resolve()
            } catch {
                call.reject("Nie można usunąć filmu roboczego.", "VIDEO_DELETE_FAILED", error)
            }
        }
    }

    private func authorizeCamera(completion: @escaping (Bool) -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            completion(true)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video, completionHandler: completion)
        default:
            completion(false)
        }
    }

    private func allowedVideoURL(path: String) -> URL? {
        let url = URL(fileURLWithPath: path).standardizedFileURL
        let root = HighSpeedCameraViewController.labDirectory.standardizedFileURL.path + "/"
        guard url.isFileURL, url.path.hasPrefix(root), url.pathExtension.lowercased() == "mov" else {
            return nil
        }
        return url
    }
}
