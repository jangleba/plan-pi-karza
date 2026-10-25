import Capacitor
import CoreLocation
import Foundation
import UIKit
import Darwin

/// Native owns the recording while React is suspended. Coordinates are only in memory.
@objc(BallwiseRuntimePlugin)
public final class BallwiseRuntimePlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "BallwiseRuntimePlugin"
    public let jsName = "BallwiseRuntime"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getOwnerState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pauseOwner", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearOwner", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "quarantineCorruptCheckpoint", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateIntervals", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "diagnostics", returnType: CAPPluginReturnPromise)
    ]
    private let location = CLLocationManager()
    private var run: [String: Any]?
    private var lastPoint: CLLocation?
    private var lastCheckpoint: TimeInterval = 0
    private var permissionCall: CAPPluginCall?
    private var permissionTimer: Timer?
    private var heartbeat: Timer?
    private var storageFailure: String?
    private var monotonicStart: TimeInterval?
    private var inactiveObserver: NSObjectProtocol?

    private var checkpointURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("BallwiseRuntime", isDirectory: true)
            .appendingPathComponent("running-v1.json")
    }
    public override func load() {
        DispatchQueue.main.async {
            self.location.delegate = self
            self.location.desiredAccuracy = kCLLocationAccuracyBest
            self.location.distanceFilter = 3
            self.location.activityType = .fitness
            self.location.pausesLocationUpdatesAutomatically = false
            do {
                if FileManager.default.fileExists(atPath: self.checkpointURL.path) {
                    let data = try Data(contentsOf: self.checkpointURL)
                    guard var saved = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                          saved["schema"] as? Int == 1,
                          let owner = saved["ownerId"] as? String, UUID(uuidString: owner) != nil,
                          let session = saved["sessionId"] as? String, UUID(uuidString: session) != nil,
                          let duration = saved["durationSec"] as? Double, duration.isFinite, duration >= 0,
                          let distance = saved["distanceM"] as? Double, distance.isFinite, distance >= 0,
                          let phase = saved["phase"] as? String, ["recording", "paused", "review"].contains(phase),
                          let date = saved["date"] as? String, date.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil,
                          let start = saved["startedAt"] as? String, ISO8601DateFormatter().date(from: start) != nil else { throw RuntimeError.corrupt }
                    // Never fabricate distance/time while the process did not run.
                    if saved["phase"] as? String == "recording" {
                        saved["phase"] = "paused"
                        saved["recovered"] = true
                        saved["activeSince"] = NSNull()
                    }
                    if var guide = saved["guideState"] as? [String: Any] { guide["started"] = false; saved["guideState"] = guide }
                    self.run = saved
                }
            } catch { self.storageFailure = "Nie można odczytać szkicu biegu. Nie nadpisano go." }
            self.inactiveObserver = NotificationCenter.default.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
                guard let self, var guide = self.run?["guideState"] as? [String: Any] else { return }
                guide["started"] = false; self.run?["guideState"] = guide
                self.checkpoint(); self.publish()
            }
            self.heartbeat = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                guard let self, self.run?["phase"] as? String == "recording" else { return }
                self.publish()
                if Date().timeIntervalSince1970 - self.lastCheckpoint >= 5 { self.checkpoint() }
            }
        }
    }
    deinit { heartbeat?.invalidate(); permissionTimer?.invalidate(); if let inactiveObserver { NotificationCenter.default.removeObserver(inactiveObserver) } }
    private enum RuntimeError: Error { case corrupt }
    private var backgroundConfigured: Bool {
        (Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String])?.contains("location") == true
    }
    private func elapsed() -> Double {
        let accumulated = run?["durationSec"] as? Double ?? 0
        guard run?["phase"] as? String == "recording", let start = monotonicStart else { return accumulated }
        return accumulated + max(0, monotonicNow() - start)
    }
    private func monotonicNow() -> TimeInterval {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return Double(mach_continuous_time()) * Double(info.numer) / Double(max(1, info.denom)) / 1_000_000_000
    }
    private func snapshot() -> [String: Any] {
        guard var value = run else { return ["present": false] }
        value["present"] = true
        value["durationSec"] = elapsed()
        value.removeValue(forKey: "activeSince")
        if let storageFailure { value["storageError"] = storageFailure }
        return value
    }
    @discardableResult private func checkpoint() -> Bool {
        guard var value = run else { return true }
        value["durationSec"] = elapsed()
        if value["phase"] as? String == "recording" { value["activeSince"] = Date().timeIntervalSince1970 }
        else { value["activeSince"] = NSNull() }
        do {
            let parent = checkpointURL.deletingLastPathComponent()
            try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
            let data = try JSONSerialization.data(withJSONObject: value)
            try data.write(to: checkpointURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            run = value
            if value["phase"] as? String == "recording" { monotonicStart = monotonicNow() }
            lastCheckpoint = Date().timeIntervalSince1970
            storageFailure = nil
            return true
        } catch {
            storageFailure = "Nie zapisano szkicu biegu. Zwolnij miejsce w telefonie i zapisz wynik przed wyjściem."
            return false
        }
    }
    private func publish() { notifyListeners("runState", data: snapshot()) }
    private func owns(_ call: CAPPluginCall) -> Bool {
        guard let run, run["ownerId"] as? String == call.getString("ownerId"),
              run["sessionId"] as? String == call.getString("sessionId") else {
            call.reject("Nie ma biegu dla tego konta i sesji.", "RUN_NOT_FOUND")
            return false
        }
        return true
    }
    @objc public func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let error = self.storageFailure, self.run == nil { call.reject(error, "CHECKPOINT_UNREADABLE"); return }
            guard self.run?["ownerId"] as? String == call.getString("ownerId"),
                  self.run?["sessionId"] as? String == call.getString("sessionId") else { call.resolve(["present": false]); return }
            call.resolve(self.snapshot())
        }
    }
    @objc public func getOwnerState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let owner = call.getString("ownerId"), UUID(uuidString: owner) != nil else { call.reject("Nieprawidłowe konto."); return }
            var result = self.run?["ownerId"] as? String == owner ? self.snapshot() : ["present": false]
            do {
                result["corruptCheckpoints"] = try self.ownerRecoveryFiles(owner).map { url in
                    ["fileName": url.lastPathComponent, "raw": try String(contentsOf: url, encoding: .utf8)]
                }
                call.resolve(result)
            } catch { call.reject("Nie można wyeksportować wszystkich szkiców biegu.", "CHECKPOINT_EXPORT_FAILED") }
        }
    }
    private func cancelPending(_ owner: String?) {
        guard let pending = permissionCall, pending.getString("ownerId") == owner else { return }
        permissionCall = nil; permissionTimer?.invalidate(); permissionTimer = nil
        pending.reject("Start biegu anulowano po wylogowaniu lub usunięciu konta.", "RUN_CANCELLED")
    }
    private func ownerRecoveryFiles(_ owner: String) throws -> [URL] {
        let directory = checkpointURL.deletingLastPathComponent()
        guard FileManager.default.fileExists(atPath: directory.path) else { return [] }
        var files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasPrefix("corrupt-owner-\(owner)-") && $0.pathExtension == "json" }
        // A parsable identity attributes the corrupt file, never authorizes resuming it.
        if run == nil, let data = try? Data(contentsOf: checkpointURL),
           let raw = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], raw["ownerId"] as? String == owner {
            files.append(checkpointURL)
        }
        return files
    }
    @objc public func pauseOwner(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.cancelPending(call.getString("ownerId"))
            guard self.run?["ownerId"] as? String == call.getString("ownerId") else { call.resolve(["present": false]); return }
            self.pauseInternal(); call.resolve(self.snapshot())
        }
    }
    @objc public func clearOwner(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let owner = call.getString("ownerId"), UUID(uuidString: owner) != nil else { call.reject("Nieprawidłowe konto."); return }
            self.cancelPending(owner)
            do {
                let files = try self.ownerRecoveryFiles(owner)
                for url in files { try FileManager.default.removeItem(at: url) }
                if self.run == nil && files.contains(self.checkpointURL) { self.storageFailure = nil }
            }
            catch { call.reject("Nie usunięto odzyskiwanych szkiców tego konta.", "CHECKPOINT_DELETE_FAILED"); return }
            if self.run?["ownerId"] as? String == owner { self.removeCheckpoint(call) }
            else { call.resolve(["present": false]) }
        }
    }
    @objc public func quarantineCorruptCheckpoint(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard call.getBool("confirm") == true, self.run == nil, self.storageFailure != nil else { call.reject("Nie potwierdzono odzyskiwania uszkodzonego szkicu."); return }
            do {
                if FileManager.default.fileExists(atPath: self.checkpointURL.path) {
                    var label = "unknown"
                    if let data = try? Data(contentsOf: self.checkpointURL),
                       let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                       let owner = value["ownerId"] as? String, UUID(uuidString: owner) != nil { label = "owner-\(owner)" }
                    let quarantine = self.checkpointURL.deletingLastPathComponent().appendingPathComponent("corrupt-\(label)-\(UUID().uuidString).json")
                    try FileManager.default.moveItem(at: self.checkpointURL, to: quarantine)
                }
                self.storageFailure = nil; call.resolve(["present": false])
            } catch { call.reject("Nie zabezpieczono uszkodzonego szkicu. Zwolnij miejsce i spróbuj ponownie.") }
        }
    }
    @objc public func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.run == nil, self.storageFailure == nil else { call.reject("Istnieje niezapisany szkic biegu. Otwórz go lub usuń przed nowym startem.", "RUN_EXISTS"); return }
            guard let owner = call.getString("ownerId"), UUID(uuidString: owner) != nil,
                  let session = call.getString("sessionId"), UUID(uuidString: session) != nil,
                  let date = call.getString("date"), date.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else { call.reject("Nieprawidłowe konto lub sesja."); return }
            guard self.backgroundConfigured else { call.reject("Brakuje konfiguracji lokalizacji w tle w projekcie iOS.", "BACKGROUND_NOT_CONFIGURED"); return }
            guard CLLocationManager.locationServicesEnabled() else { call.reject("Włącz lokalizację w Ustawieniach.", "LOCATION_DISABLED"); return }
            switch self.location.authorizationStatus {
            case .authorizedAlways, .authorizedWhenInUse: self.begin(call, owner: owner, session: session, date: date)
            case .notDetermined:
                guard self.permissionCall == nil else { call.reject("Oczekiwanie na zgodę lokalizacji."); return }
                self.permissionCall = call
                self.permissionTimer = Timer.scheduledTimer(withTimeInterval: 45, repeats: false) { [weak self] _ in
                    self?.permissionCall?.reject("Nie otrzymano zgody na lokalizację. Spróbuj ponownie.", "LOCATION_TIMEOUT")
                    self?.permissionCall = nil
                }
                self.location.requestWhenInUseAuthorization()
            default: call.reject("Zezwól BallWise na lokalizację w Ustawieniach.", "LOCATION_DENIED")
            }
        }
    }
    private func begin(_ call: CAPPluginCall, owner: String, session: String, date: String) {
        guard location.accuracyAuthorization == .fullAccuracy else { call.reject("Włącz Dokładną lokalizację dla BallWise w Ustawieniach iPhone'a.", "PRECISE_LOCATION_REQUIRED"); return }
        run = ["schema": 1, "ownerId": owner, "sessionId": session, "date": date,
               "startedAt": ISO8601DateFormatter().string(from: Date()), "phase": "recording",
               "durationSec": 0.0, "distanceM": 0.0, "pointCount": 0, "intervalResults": [],
               "activeSince": Date().timeIntervalSince1970, "recovered": false]
        guard checkpoint() else { run = nil; call.reject(storageFailure ?? "Nie zapisano szkicu."); return }
        lastPoint = nil
        monotonicStart = monotonicNow()
        location.allowsBackgroundLocationUpdates = true
        location.showsBackgroundLocationIndicator = true
        location.startUpdatingLocation()
        publish(); call.resolve(snapshot())
    }
    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard let call = permissionCall, manager.authorizationStatus != .notDetermined else { return }
        permissionCall = nil; permissionTimer?.invalidate(); permissionTimer = nil
        guard manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse else { call.reject("Nie udzielono dostępu do lokalizacji.", "LOCATION_DENIED"); return }
        guard let owner = call.getString("ownerId"), let session = call.getString("sessionId"), let date = call.getString("date") else { call.reject("Nieprawidłowa sesja."); return }
        begin(call, owner: owner, session: session, date: date)
    }
    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard run?["phase"] as? String == "recording" else { return }
        for point in locations {
            guard point.horizontalAccuracy >= 0, point.horizontalAccuracy <= 35,
                  abs(point.timestamp.timeIntervalSinceNow) <= 20 else { continue }
            if let previous = lastPoint {
                let seconds = point.timestamp.timeIntervalSince(previous.timestamp)
                let meters = point.distance(from: previous)
                guard seconds > 0 else { continue }
                // Do not bridge a long GPS outage or count an impossible jump.
                if seconds <= 30 && meters / seconds <= 12 {
                    run?["distanceM"] = (run?["distanceM"] as? Double ?? 0) + meters
                }
            }
            lastPoint = point
            run?["pointCount"] = (run?["pointCount"] as? Int ?? 0) + 1
            run?["accuracyM"] = point.horizontalAccuracy
        }
        checkpoint(); publish()
    }
    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if (error as? CLError)?.code == .denied { pauseInternal() }
        notifyListeners("runError", data: ["message": "GPS jest niedostępny. Sprawdź uprawnienia i sygnał."])
    }
    private func pauseInternal() {
        guard run != nil else { return }
        let duration = elapsed()
        run?["durationSec"] = duration; run?["activeSince"] = NSNull(); run?["phase"] = "paused"
        monotonicStart = nil
        lastPoint = nil; location.stopUpdatingLocation(); checkpoint(); publish()
    }
    @objc public func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async { if self.owns(call) { self.pauseInternal(); call.resolve(self.snapshot()) } }
    }
    @objc public func resume(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.owns(call) else { return }
            guard self.run?["phase"] as? String == "paused" else { call.resolve(self.snapshot()); return }
            guard self.location.authorizationStatus == .authorizedAlways || self.location.authorizationStatus == .authorizedWhenInUse else { call.reject("Zezwól na lokalizację w Ustawieniach."); return }
            guard self.location.accuracyAuthorization == .fullAccuracy else { call.reject("Włącz Dokładną lokalizację dla BallWise w Ustawieniach."); return }
            self.run?["phase"] = "recording"; self.run?["activeSince"] = Date().timeIntervalSince1970
            self.monotonicStart = self.monotonicNow()
            guard self.checkpoint() else { self.pauseInternal(); call.reject(self.storageFailure ?? "Nie zapisano szkicu."); return }
            self.lastPoint = nil; self.location.startUpdatingLocation(); self.publish(); call.resolve(self.snapshot())
        }
    }
    @objc public func finish(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.owns(call) else { return }
            guard (self.run?["distanceM"] as? Double ?? 0) >= 50 else { call.reject("Za mało wiarygodnego dystansu GPS. Potrzeba co najmniej 50 m."); return }
            self.pauseInternal(); self.run?["phase"] = "review"
            self.run?["endedAt"] = ISO8601DateFormatter().string(from: Date())
            guard self.checkpoint() else { call.reject(self.storageFailure ?? "Nie zapisano wyniku."); return }
            self.publish(); call.resolve(self.snapshot())
        }
    }
    @objc public func updateIntervals(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.owns(call) else { return }
            guard let intervals = call.getArray("intervalResults") else { call.reject("Brakuje wyników interwałów."); return }
            guard intervals.count <= 500, JSONSerialization.isValidJSONObject(intervals) else { call.reject("Nieprawidłowe interwały."); return }
            self.run?["intervalResults"] = intervals
            if let guide = call.getObject("guideState") { self.run?["guideState"] = guide }
            guard self.checkpoint() else { call.reject(self.storageFailure ?? "Nie zapisano interwałów."); return }
            call.resolve(self.snapshot())
        }
    }
    @objc public func clear(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.owns(call) else { return }
            self.removeCheckpoint(call)
        }
    }
    private func removeCheckpoint(_ call: CAPPluginCall) {
        location.stopUpdatingLocation(); lastPoint = nil; monotonicStart = nil
        do {
            if FileManager.default.fileExists(atPath: checkpointURL.path) { try FileManager.default.removeItem(at: checkpointURL) }
            run = nil; storageFailure = nil; call.resolve(["present": false])
        } catch { call.reject("Nie usunięto szkicu biegu.", "CHECKPOINT_DELETE_FAILED") }
    }
    @objc public func diagnostics(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let unknownCopies = (try? FileManager.default.contentsOfDirectory(atPath: self.checkpointURL.deletingLastPathComponent().path))?.filter { $0.hasPrefix("corrupt-unknown-") }.count ?? 0
            call.resolve(["platform": "ios", "systemVersion": UIDevice.current.systemVersion,
                          "backgroundLocationConfigured": self.backgroundConfigured,
                          "locationServicesEnabled": CLLocationManager.locationServicesEnabled(),
                          "authorization": self.location.authorizationStatus.rawValue,
                          "preciseLocation": self.location.accuracyAuthorization == .fullAccuracy,
                          "coordinatesPersisted": false, "checkpointSchema": 1,
                          "unattributedRecoveryCopies": unknownCopies])
        }
    }
}
