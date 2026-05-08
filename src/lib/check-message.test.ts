import { describe, expect, it } from 'vitest';
import { compareMessages } from './check-message';

describe('compareMessages', () => {
	describe('escaped quotes', () => {
		it('passes when escaped quotes are preserved', () => {
			const source = '\\"Installatie afgekeurd\\"';
			const translation = '\\"Installation abgelehnt\\"';

			expect(compareMessages(source, translation)).toEqual([]);
		});

		it('detects unescaped quotes', () => {
			const source = '\\"Installatie afgekeurd\\"';
			const translation = '"Installation abgelehnt"';

			expect(compareMessages(source, translation)).toEqual([
				{
					type: 'UNESCAPED_QUOTE',
					message:
						'Translation uses raw quotes (") instead of Lingui-escaped quotes (\\")',
				},
			]);
		});

		it('detects double escaped quotes', () => {
			const source = '\\"Installatie afgekeurd\\"';
			const translation = '\\\\"Installation abgelehnt\\\\"';

			expect(compareMessages(source, translation)).toEqual([
				{
					type: 'DOUBLE_ESCAPED_QUOTE',
					message:
						'Translation uses double-escaped quotes (\\\\") instead of single-escaped quotes (\\")',
				},
			]);
		});

		it('ignores quote checks when source has no escaped quotes', () => {
			const source = 'Hello';
			const translation = '"Hallo"';

			expect(compareMessages(source, translation)).toEqual([]);
		});
	});

	describe('numeric XML tags', () => {
		it('passes when tags match correctly', () => {
			const source = '<0>Belangrijk!</0>';
			const translation = '<0>Wichtig!</0>';

			expect(compareMessages(source, translation)).toEqual([]);
		});

		it('detects missing tags', () => {
			const source = '<0>Belangrijk!</0>';
			const translation = 'Wichtig!';

			expect(compareMessages(source, translation)).toEqual([
				{
					type: 'TAG_MISSING',
					message: 'Tag <0> exists in source but is missing from translation',
				},
			]);
		});

		it('detects extra tags', () => {
			const source = '<0>Belangrijk!</0>';
			const translation = '<1>Wichtig!</1>';

			expect(compareMessages(source, translation)).toEqual([
				{
					type: 'TAG_MISSING',
					message: 'Tag <0> exists in source but is missing from translation',
				},
				{
					type: 'TAG_EXTRA',
					message: 'Tag <1> exists in translation but not in source',
				},
			]);
		});

		it('detects mismatched closing tags', () => {
			const source = '<0>Belangrijk!</0>';
			const translation = '<0>Wichtig!</1>';

			expect(compareMessages(source, translation)).toEqual([
				{
					message: "Tag <1> exists in translation but not in source",
					type: "TAG_EXTRA",
				},
			]);
		});

		it('detects unopened closing tags', () => {
			const source = '<0>Belangrijk!</0>';
			const translation = '</0>Wichtig!';

			expect(compareMessages(source, translation)).toEqual([
				{
					type: 'TAG_UNBALANCED',
					message:
						'Closing tag </0> in translation has no matching opening tag',
				},
			]);
		});

		it('detects unclosed opening tags', () => {
			const source = '<0>Belangrijk!</0>';
			const translation = '<0>Wichtig!';

			expect(compareMessages(source, translation)).toEqual([
				{
					type: 'TAG_UNBALANCED',
					message: 'Opening tag <0> in translation is never closed',
				},
			]);
		});

		it('passes for nested tags', () => {
			const source =
				'<2>De volgende afspraken zijn gemaakt met uw adviseur, {0}:<3>{1}</3></2>';

			const translation =
				'<2>Folgende Vereinbarungen wurden mit Ihrem Berater, {0}, getroffen:<3>{1}</3></2>';

			expect(compareMessages(source, translation)).toEqual([]);
		});

		it('detects incorrectly nested tags', () => {
			const source =
				'<2>De volgende afspraken zijn gemaakt met uw adviseur, {0}:<3>{1}</3></2>';

			const translation =
				'<2>Folgende Vereinbarungen wurden mit Ihrem Berater, {0}, getroffen:<3>{1}</2></3>';

			expect(compareMessages(source, translation)).toEqual([
				{
					type: 'TAG_UNBALANCED',
					message:
						'Mismatched tags in translation: expected </3>, found </2>',
				},
				{
					type: 'TAG_UNBALANCED',
					message:
						'Mismatched tags in translation: expected </2>, found </3>',
				},
			]);
		});
	});

	describe('numeric placeholders', () => {
		it('passes when placeholders match', () => {
			const source = 'Hallo {0}, welkom {1}';
			const translation = 'Hallo {0}, willkommen {1}';

			expect(compareMessages(source, translation)).toEqual([]);
		});

		it('detects missing placeholders', () => {
			const source = 'Hallo {0}, welkom {1}';
			const translation = 'Hallo welkom';

			expect(compareMessages(source, translation)).toEqual([
				{
					type: 'PLACEHOLDER_MISSING',
					message:
						'Placeholder {0} exists in source but is missing from translation',
				},
				{
					type: 'PLACEHOLDER_MISSING',
					message:
						'Placeholder {1} exists in source but is missing from translation',
				},
			]);
		});

		it('detects extra placeholders', () => {
			const source = 'Hallo {0}';
			const translation = 'Hallo {0} {1}';

			expect(compareMessages(source, translation)).toEqual([
				{
					type: 'PLACEHOLDER_EXTRA',
					message:
						'Placeholder {1} exists in translation but not in source',
				},
			]);
		});

		it('detects invalid placeholder replacements', () => {
			const source =
				'<2>De volgende afspraken zijn gemaakt met uw adviseur, {0}:<3>{1}</3></2>';

			const translation =
				'<2>Folgende Vereinbarungen wurden mit Ihrem Berater, {a}, getroffen:<3>{b}</3></2>';

			expect(compareMessages(source, translation)).toEqual([
				{
					type: 'PLACEHOLDER_MISSING',
					message:
						'Placeholder {0} exists in source but is missing from translation',
				},
				{
					type: 'PLACEHOLDER_MISSING',
					message:
						'Placeholder {1} exists in source but is missing from translation',
				},
			]);
		});

		it('detects placeholders converted to raw text', () => {
			const source =
				'<2>De volgende afspraken zijn gemaakt met uw adviseur, {0}:<3>{1}</3></2>';

			const translation =
				'<2>Folgende Vereinbarungen wurden mit Ihrem Berater, 0, getroffen:<3>1</3></2>';

			expect(compareMessages(source, translation)).toEqual([
				{
					type: 'PLACEHOLDER_MISSING',
					message:
						'Placeholder {0} exists in source but is missing from translation',
				},
				{
					type: 'PLACEHOLDER_MISSING',
					message:
						'Placeholder {1} exists in source but is missing from translation',
				},
			]);
		});
	});

	describe('ICU expressions', () => {
		it('passes when ICU plural syntax matches', () => {
			const source =
				"{count, plural, one {airco} other {airco's}}";

			const translation =
				'{count, plural, one {Klimaanlage} other {Klimaanlagen}}';

			expect(compareMessages(source, translation)).toEqual([]);
		});

		it('detects ICU variable mismatch', () => {
			const source =
				"{count, plural, one {airco} other {airco's}}";

			const translation =
				'{Count, plural, one {Klimaanlage} other {Klimaanlagen}}';

			expect(compareMessages(source, translation)).toEqual([
				{
					type: 'ICU_VARIABLE_MISMATCH',
					message:
						'ICU variable mismatch: source uses "count", translation uses "Count"',
				},
			]);
		});

		it('detects ICU keyword mismatch', () => {
			const source =
				"{count, plural, one {airco} other {airco's}}";

			const translation =
				'{count, select, one {Klimaanlage} other {Klimaanlagen}}';

			expect(compareMessages(source, translation)).toEqual([
				{
					type: 'ICU_KEYWORD_MISMATCH',
					message:
						'ICU keyword mismatch: source uses "plural", translation uses "select"',
				},
			]);
		});

		it('detects ICU category mismatches', () => {
			const source =
				"{count, plural, one {airco} other {airco's}}";

			const translation =
				'{count, plural, eine {Klimaanlage} andere {Klimaanlagen}}';

			expect(compareMessages(source, translation)).toEqual([
				{
					type: 'ICU_CATEGORIES_MISSING',
					message:
						'ICU plural categories missing in translation: "one", "other"',
				},
				{
					type: 'ICU_CATEGORIES_EXTRA',
					message:
						'ICU categories in translation not present in source: "eine", "andere"',
				},
			]);
		});

		it('detects ICU expression count mismatch', () => {
			const source =
				'{count, plural, one {1 item} other {# items}}';

			const translation = 'Keine ICU hier';

			expect(compareMessages(source, translation)).toEqual([
				{
					type: 'ICU_COUNT_MISMATCH',
					message:
						'Source has 1 ICU expression(s) but translation has 0',
				},
			]);
		});

		it('passes with nested ICU expressions and placeholders', () => {
			const source =
				'<15>{4, plural, one {Een (paar) dag(en) voor de installatiedatum wordt uw {5} inclusief het installatiemateriaal bezorgd door ons of door een externe koerier.} other {Een (paar) dag(en) voor de installatiedatum worden uw {6} inclusief het installatiemateriaal bezorgd door ons of door een externe koerier.}}</15>';

			const translation =
				'<15>{4, plural, one {Ein (einige) Tag(e) vor dem Installationsdatum wird Ihre {5} inklusive Installationsmaterial von uns oder einem externen Kurier geliefert.} other {Ein (einige) Tag(e) vor dem Installationsdatum werden Ihre {6} inklusive Installationsmaterial von uns oder einem externen Kurier geliefert.}}</15>';

			expect(compareMessages(source, translation)).toEqual([]);
		});

		it('supports exact-match ICU categories', () => {
			const source =
				'{count, plural, =0 {none} one {one} other {many}}';

			const translation =
				'{count, plural, =0 {kein} one {eins} other {viele}}';

			expect(compareMessages(source, translation)).toEqual([]);
		});
	});

	describe('combined validation', () => {
		it('returns multiple problem types together', () => {
			const source =
				'<0>\\"Hello {0}\\"</0>';

			const translation =
				'<1>"Hallo"</1>';

			expect(compareMessages(source, translation)).toEqual([
				{
					type: 'UNESCAPED_QUOTE',
					message:
						'Translation uses raw quotes (") instead of Lingui-escaped quotes (\\")',
				},
				{
					type: 'TAG_MISSING',
					message: 'Tag <0> exists in source but is missing from translation',
				},
				{
					type: 'TAG_EXTRA',
					message: 'Tag <1> exists in translation but not in source',
				},
				{
					type: 'PLACEHOLDER_MISSING',
					message:
						'Placeholder {0} exists in source but is missing from translation',
				},
			]);
		});
	});
});
