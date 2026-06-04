import XCTest
@testable import OracleKit

final class CastingTests: XCTestCase {
    // King-Wen table must have all 64 distinct binaries → 1...64 (mirrors scripts/test-kingwen.mjs).
    func testKingWenComplete() {
        let table = Casting.binaryToKingWen
        XCTAssertEqual(table.count, 64)
        XCTAssertEqual(Set(table.values), Set(1...64))
        for (bin, _) in table {
            XCTAssertEqual(bin.count, 6)
            XCTAssertTrue(bin.allSatisfy { $0 == "0" || $0 == "1" })
        }
    }

    func testLineState() {
        XCTAssertEqual(Casting.lineState(6).changing, true);  XCTAssertEqual(Casting.lineState(6).yang, false)
        XCTAssertEqual(Casting.lineState(7).changing, false); XCTAssertEqual(Casting.lineState(7).yang, true)
        XCTAssertEqual(Casting.lineState(8).changing, false); XCTAssertEqual(Casting.lineState(8).yang, false)
        XCTAssertEqual(Casting.lineState(9).changing, true);  XCTAssertEqual(Casting.lineState(9).yang, true)
        XCTAssertEqual(Casting.lineState(6).target, 1) // changing yin → yang
        XCTAssertEqual(Casting.lineState(9).target, 0) // changing yang → yin
    }

    func testBinaryAndKingWen() {
        let yang = Array(repeating: Casting.Line(value: 7), count: 6)
        XCTAssertEqual(Casting.binary(yang), "111111")
        XCTAssertEqual(Casting.kingWen(Casting.binary(yang)), 1)
        let yin = Array(repeating: Casting.Line(value: 8), count: 6)
        XCTAssertEqual(Casting.binary(yin), "000000")
        XCTAssertEqual(Casting.kingWen(Casting.binary(yin)), 2)
    }

    func testTargetBinary() {
        // bottom line changing yin (6), rest stable yang (7): primary "011111", target flips bottom → "111111".
        var lines = Array(repeating: Casting.Line(value: 7), count: 6)
        lines[0] = Casting.Line(value: 6)
        XCTAssertEqual(Casting.binary(lines), "011111")
        XCTAssertEqual(Casting.binary(lines, useTarget: true), "111111")
    }

    func testLinesFromBinaryRoundTrip() {
        for (bin, _) in Casting.binaryToKingWen {
            XCTAssertEqual(Casting.binary(Casting.linesFromBinary(bin)), bin)
        }
    }

    func testCastInRange() {
        for _ in 0..<200 { for l in Casting.cast() { XCTAssertTrue((6...9).contains(l.value)) } }
    }
}
