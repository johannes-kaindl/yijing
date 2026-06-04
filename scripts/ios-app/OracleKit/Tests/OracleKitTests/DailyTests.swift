import XCTest
@testable import OracleKit

final class DailyTests: XCTestCase {
    private var berlin: Calendar {
        var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "Europe/Berlin")!; return c
    }

    func testDeterministicAndInRange() {
        let cal = berlin
        let d = cal.date(from: DateComponents(year: 2026, month: 6, day: 5))!
        let a = Daily.hexagramNumber(for: d, calendar: cal)
        let b = Daily.hexagramNumber(for: d, calendar: cal)
        XCTAssertEqual(a, b)
        XCTAssertTrue((1...64).contains(a))
    }

    // Collision-robust: over two weeks the daily numbers must vary widely (not a
    // brittle single-pair check — same-value adjacent days are possible by chance).
    func testVariesAcrossDays() {
        let cal = berlin
        var values = Set<Int>()
        for day in 1...14 {
            let d = cal.date(from: DateComponents(year: 2026, month: 6, day: day))!
            values.insert(Daily.hexagramNumber(for: d, calendar: cal))
        }
        XCTAssertGreaterThanOrEqual(values.count, 5, "Daily numbers should vary across 14 days, got \(values.sorted())")
    }

    func testNextMidnightIsFuture() {
        let now = Date()
        XCTAssertGreaterThan(Daily.nextMidnight(after: now), now)
    }
}
