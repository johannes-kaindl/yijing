// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// Codable mirror of data/hexagrams.json (DE) and data/hexagrams.en.json (EN).
// All language/register variants are optional so one struct decodes both files;
// the field-name asymmetry (judgment vs judgment_en vs *_neutral) is resolved in
// Texts.swift, nowhere else.

import Foundation

public struct Trigram: Codable {
    public let name: String?
    public let symbol: String?
    public let family: String?
    public let nature: String?
}

public struct Trigrams: Codable {
    public let above: Trigram?
    public let below: Trigram?
}

public struct HexLine: Codable {
    public let position: String?
    public let text: String?
    public let interpretation: String?
    public let interpretation_neutral: String?
    public let position_en: String?
    public let text_en: String?
    public let interpretation_en: String?
    public let interpretation_en_neutral: String?
}

public struct Hexagram: Codable {
    public let number: Int
    public let binary: String
    public let unicode: String?
    public let name_de: String?
    public let name_en: String?
    public let name_latin: String?
    public let name_chinese: String?
    public let pinyin: String?
    public let trigrams: Trigrams?
    public let judgment: String?
    public let judgment_neutral: String?
    public let judgment_en: String?
    public let judgment_en_neutral: String?
    public let image: String?
    public let image_neutral: String?
    public let image_en: String?
    public let image_en_neutral: String?
    public let lines: [HexLine]?
}
