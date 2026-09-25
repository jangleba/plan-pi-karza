import AVFoundation
import Foundation
import UIKit

struct BallWiseCapture {
    let url: URL
    let fps: Double
    let width: Int
    let height: Int
    let durationSeconds: Double
    let frameCount: Int
    let codec: String
}

enum BallWiseCaptureOutcome {
    case success(BallWiseCapture)
    case cancelled
    case failure(String)
}

struct BallWiseFormatSelection {
    let device: AVCaptureDevice
    let format: AVCaptureDevice.Format
    let fps: Double
    let width: Int
    let height: Int
}

final class HighSpeedCameraViewController: UIViewController, AVCaptureFileOutputRecordingDelegate {
    static let labDirectory: URL = {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return caches.appendingPathComponent("BallWiseLab", isDirectory: true)
    }()

    private let session = AVCaptureSession()
    private let output = AVCaptureMovieFileOutput()
    private let sessionQueue = DispatchQueue(label: "app.ballwise.camera.session", qos: .userInitiated)
    private let maximumDuration: Double
    private let completion: (BallWiseCaptureOutcome) -> Void
    private var selection: BallWiseFormatSelection?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var timer: Timer?
    private var recordingStartedAt: Date?
    private var cancellationRequested = false
    private var finished = false

    private let closeButton = UIButton(type: .system)
    private let recordButton = UIButton(type: .custom)
    private let fpsLabel = UILabel()
    private let timerLabel = UILabel()
    private let helpLabel = UILabel()

    init(maximumDuration: Double, completion: @escaping (BallWiseCaptureOutcome) -> Void) {
        self.maximumDuration = maximumDuration
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureInterface()
        configureSession()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        sessionQueue.async { [weak self] in
            guard let self, !self.session.isRunning else { return }
            self.session.startRunning()
        }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        timer?.invalidate()
        sessionQueue.async { [weak self] in
            guard let self, self.session.isRunning else { return }
            self.session.stopRunning()
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
        updatePreviewRotation()
    }

    static func best240FPSFormat() -> BallWiseFormatSelection? {
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
            return nil
        }

        let candidates = device.formats.compactMap { format -> BallWiseFormatSelection? in
            let ranges = format.videoSupportedFrameRateRanges
            guard ranges.contains(where: { $0.maxFrameRate >= 239 && $0.minFrameRate <= 240 }) else {
                return nil
            }
            let dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            guard dimensions.width >= 1280, dimensions.height >= 720 else { return nil }
            return BallWiseFormatSelection(
                device: device,
                format: format,
                fps: 240,
                width: Int(dimensions.width),
                height: Int(dimensions.height)
            )
        }

        return candidates.sorted { lhs, rhs in
            let lhsPreferred = lhs.width == 1920 && lhs.height == 1080
            let rhsPreferred = rhs.width == 1920 && rhs.height == 1080
            if lhsPreferred != rhsPreferred { return lhsPreferred }
            return lhs.width * lhs.height > rhs.width * rhs.height
        }.first
    }

    private func configureSession() {
        sessionQueue.async { [weak self] in
            guard let self, let selection = Self.best240FPSFormat() else {
                self?.finish(.failure("Ten iPhone nie udostępnia nagrywania 240 FPS."))
                return
            }
            self.selection = selection
            self.session.beginConfiguration()
            self.session.sessionPreset = .inputPriority

            do {
                let input = try AVCaptureDeviceInput(device: selection.device)
                guard self.session.canAddInput(input), self.session.canAddOutput(self.output) else {
                    self.session.commitConfiguration()
                    self.finish(.failure("Nie można skonfigurować kamery 240 FPS."))
                    return
                }

                self.session.addInput(input)
                self.session.addOutput(self.output)
                try selection.device.lockForConfiguration()
                selection.device.activeFormat = selection.format
                let duration = CMTime(value: 1, timescale: 240)
                selection.device.activeVideoMinFrameDuration = duration
                selection.device.activeVideoMaxFrameDuration = duration
                if selection.device.isFocusModeSupported(.continuousAutoFocus) {
                    selection.device.focusMode = .continuousAutoFocus
                }
                if selection.device.isExposureModeSupported(.continuousAutoExposure) {
                    selection.device.exposureMode = .continuousAutoExposure
                }
                selection.device.unlockForConfiguration()
                self.output.maxRecordedDuration = CMTime(seconds: self.maximumDuration, preferredTimescale: 600)
                self.session.commitConfiguration()

                DispatchQueue.main.async {
                    self.attachPreview()
                    self.fpsLabel.text = "240 FPS • \(selection.width)×\(selection.height)"
                }
            } catch {
                self.session.commitConfiguration()
                self.finish(.failure("Konfiguracja kamery nie powiodła się: \(error.localizedDescription)"))
            }
        }
    }

    private func configureInterface() {
        fpsLabel.translatesAutoresizingMaskIntoConstraints = false
        fpsLabel.text = "240 FPS"
        fpsLabel.textColor = .white
        fpsLabel.font = .systemFont(ofSize: 16, weight: .semibold)
        fpsLabel.textAlignment = .center
        fpsLabel.backgroundColor = UIColor.black.withAlphaComponent(0.58)
        fpsLabel.layer.cornerRadius = 18
        fpsLabel.clipsToBounds = true

        timerLabel.translatesAutoresizingMaskIntoConstraints = false
        timerLabel.text = "0,00 s"
        timerLabel.textColor = .white
        timerLabel.font = .monospacedDigitSystemFont(ofSize: 17, weight: .semibold)
        timerLabel.textAlignment = .center
        timerLabel.backgroundColor = UIColor.black.withAlphaComponent(0.58)
        timerLabel.layer.cornerRadius = 18
        timerLabel.clipsToBounds = true

        closeButton.translatesAutoresizingMaskIntoConstraints = false
        closeButton.setImage(UIImage(systemName: "xmark"), for: .normal)
        closeButton.tintColor = .white
        closeButton.backgroundColor = UIColor.black.withAlphaComponent(0.58)
        closeButton.layer.cornerRadius = 25
        closeButton.addTarget(self, action: #selector(cancelCapture), for: .touchUpInside)

        recordButton.translatesAutoresizingMaskIntoConstraints = false
        recordButton.backgroundColor = .systemRed
        recordButton.layer.cornerRadius = 38
        recordButton.layer.borderWidth = 5
        recordButton.layer.borderColor = UIColor.white.cgColor
        recordButton.addTarget(self, action: #selector(toggleRecording), for: .touchUpInside)

        helpLabel.translatesAutoresizingMaskIntoConstraints = false
        helpLabel.text = "Ustaw telefon stabilnie i obejmij cały ruch w kadrze"
        helpLabel.textColor = .white
        helpLabel.font = .systemFont(ofSize: 14, weight: .medium)
        helpLabel.textAlignment = .center
        helpLabel.numberOfLines = 2
        helpLabel.backgroundColor = UIColor.black.withAlphaComponent(0.45)
        helpLabel.layer.cornerRadius = 12
        helpLabel.clipsToBounds = true

        [fpsLabel, timerLabel, closeButton, recordButton, helpLabel].forEach(view.addSubview)

        NSLayoutConstraint.activate([
            closeButton.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 18),
            closeButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            closeButton.widthAnchor.constraint(equalToConstant: 50),
            closeButton.heightAnchor.constraint(equalToConstant: 50),
            fpsLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            fpsLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            fpsLabel.widthAnchor.constraint(greaterThanOrEqualToConstant: 126),
            fpsLabel.heightAnchor.constraint(equalToConstant: 36),
            timerLabel.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -18),
            timerLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            timerLabel.widthAnchor.constraint(equalToConstant: 86),
            timerLabel.heightAnchor.constraint(equalToConstant: 36),
            recordButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            recordButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -34),
            recordButton.widthAnchor.constraint(equalToConstant: 76),
            recordButton.heightAnchor.constraint(equalToConstant: 76),
            helpLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            helpLabel.bottomAnchor.constraint(equalTo: recordButton.topAnchor, constant: -22),
            helpLabel.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, multiplier: 0.82),
            helpLabel.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
        ])
    }

    private func attachPreview() {
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = view.bounds
        view.layer.insertSublayer(layer, at: 0)
        previewLayer = layer
        updatePreviewRotation()
    }

    private func updatePreviewRotation() {
        guard let connection = previewLayer?.connection else { return }
        applyRotation(to: connection)
    }

    private var rotationAngle: CGFloat {
        switch view.window?.windowScene?.interfaceOrientation {
        case .landscapeLeft: return 0
        case .landscapeRight: return 180
        case .portraitUpsideDown: return 270
        default: return 90
        }
    }

    private var legacyOrientation: AVCaptureVideoOrientation {
        switch view.window?.windowScene?.interfaceOrientation {
        case .landscapeLeft: return .landscapeLeft
        case .landscapeRight: return .landscapeRight
        case .portraitUpsideDown: return .portraitUpsideDown
        default: return .portrait
        }
    }

    private func applyRotation(to connection: AVCaptureConnection) {
        if #available(iOS 17.0, *) {
            if connection.isVideoRotationAngleSupported(rotationAngle) {
                connection.videoRotationAngle = rotationAngle
            }
        } else if connection.isVideoOrientationSupported {
            connection.videoOrientation = legacyOrientation
        }
    }

    @objc private func toggleRecording() {
        if output.isRecording {
            output.stopRecording()
            return
        }

        guard selection != nil else { return }
        do {
            try FileManager.default.createDirectory(at: Self.labDirectory, withIntermediateDirectories: true)
            let url = Self.labDirectory.appendingPathComponent("\(UUID().uuidString).mov")
            if let connection = output.connection(with: .video) {
                applyRotation(to: connection)
            }
            recordingStartedAt = Date()
            recordButton.backgroundColor = .white
            recordButton.layer.borderColor = UIColor.systemRed.cgColor
            startTimer()
            output.startRecording(to: url, recordingDelegate: self)
        } catch {
            finish(.failure("Nie można utworzyć filmu roboczego: \(error.localizedDescription)"))
        }
    }

    @objc private func cancelCapture() {
        guard !finished else { return }
        if output.isRecording {
            cancellationRequested = true
            output.stopRecording()
            return
        }
        finish(.cancelled)
    }

    private func startTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.04, repeats: true) { [weak self] _ in
            guard let self, let start = self.recordingStartedAt else { return }
            let elapsed = min(Date().timeIntervalSince(start), self.maximumDuration)
            self.timerLabel.text = String(format: "%.2f s", elapsed).replacingOccurrences(of: ".", with: ",")
        }
    }

    func fileOutput(
        _ output: AVCaptureFileOutput,
        didFinishRecordingTo outputFileURL: URL,
        from connections: [AVCaptureConnection],
        error: Error?
    ) {
        timer?.invalidate()
        recordButton.backgroundColor = .systemRed
        recordButton.layer.borderColor = UIColor.white.cgColor

        if cancellationRequested {
            try? FileManager.default.removeItem(at: outputFileURL)
            finish(.cancelled)
            return
        }

        if let error {
            try? FileManager.default.removeItem(at: outputFileURL)
            finish(.failure("Nagranie nie zostało zapisane: \(error.localizedDescription)"))
            return
        }

        inspectCapture(at: outputFileURL) { [weak self] outcome in
            self?.finish(outcome)
        }
    }

    private func inspectCapture(at url: URL, completion: @escaping (BallWiseCaptureOutcome) -> Void) {
        sessionQueue.async {
            let asset = AVURLAsset(url: url)
            guard let track = asset.tracks(withMediaType: .video).first else {
                try? FileManager.default.removeItem(at: url)
                completion(.failure("Nagranie nie zawiera ścieżki wideo."))
                return
            }

            let fps = Double(track.nominalFrameRate)
            let duration = asset.duration.seconds
            let dimensions = track.naturalSize.applying(track.preferredTransform)
            let width = Int(abs(dimensions.width).rounded())
            let height = Int(abs(dimensions.height).rounded())
            let frameCount = Int((duration * fps).rounded(.down))

            guard fps >= 239, duration > 0, frameCount > 1 else {
                try? FileManager.default.removeItem(at: url)
                completion(.failure("Film nie przeszedł kontroli 240 FPS. Wynik nie został utworzony."))
                return
            }

            completion(.success(BallWiseCapture(
                url: url,
                fps: fps,
                width: width,
                height: height,
                durationSeconds: duration,
                frameCount: frameCount,
                codec: "mov"
            )))
        }
    }

    private func finish(_ outcome: BallWiseCaptureOutcome) {
        DispatchQueue.main.async { [weak self] in
            guard let self, !self.finished else { return }
            self.finished = true
            self.timer?.invalidate()
            self.dismiss(animated: true) {
                self.completion(outcome)
            }
        }
    }
}
