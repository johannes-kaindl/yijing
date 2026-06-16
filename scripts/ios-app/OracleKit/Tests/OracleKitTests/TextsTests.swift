import XCTest
@testable import OracleKit

final class TextsTests: XCTestCase {
    private func hex(_ json: String) -> Hexagram {
        try! JSONDecoder().decode(Hexagram.self, from: Data(json.utf8))
    }

    func testImageSelectsLangAndRegister() {
        let h = hex(#"{"number":1,"binary":"111111","image":"BILD","image_neutral":"BILD-N","image_en":"IMG","image_en_neutral":"IMG-N"}"#)
        XCTAssertEqual(Texts.image(h, OracleSettings(lang: .de, register: .historical)), "BILD")
        XCTAssertEqual(Texts.image(h, OracleSettings(lang: .de, register: .neutral)), "BILD-N")
        XCTAssertEqual(Texts.image(h, OracleSettings(lang: .en, register: .historical)), "IMG")
        XCTAssertEqual(Texts.image(h, OracleSettings(lang: .en, register: .neutral)), "IMG-N")
    }

    func testImageFallsBackWhenNeutralMissing() {
        let h = hex(#"{"number":2,"binary":"000000","image":"BILD","image_en":"IMG"}"#)
        XCTAssertEqual(Texts.image(h, OracleSettings(lang: .de, register: .neutral)), "BILD")
        XCTAssertEqual(Texts.image(h, OracleSettings(lang: .en, register: .neutral)), "IMG")
    }

    func testImageEmptyWhenAbsent() {
        let h = hex(#"{"number":3,"binary":"010001"}"#)
        XCTAssertEqual(Texts.image(h, OracleSettings(lang: .de, register: .historical)), "")
    }
}
