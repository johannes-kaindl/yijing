// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "OracleKit",
    platforms: [.iOS(.v17), .macCatalyst(.v17), .watchOS(.v10), .macOS(.v14)],
    products: [.library(name: "OracleKit", targets: ["OracleKit"])],
    targets: [
        .target(name: "OracleKit"),
        .testTarget(name: "OracleKitTests", dependencies: ["OracleKit"]),
    ]
)
