// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "BallwiseCamera",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "BallwiseCamera", targets: ["BallWiseCameraPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "BallWiseCameraPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/BallWiseCameraPlugin"
        )
    ]
)
