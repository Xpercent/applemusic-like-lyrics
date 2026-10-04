import { describe, expect, it } from "vitest";
import {
	type RubyWidthInput,
	solveRubyWidth,
} from "#lyric/dom/ruby-spacing.ts";

/** Builds metrics for a 40px base character annotated with `annotationWidth` kana. */
const ruby = (
	naturalLeft: number,
	annotationWidth: number,
	rowTop = 0,
): RubyWidthInput => ({
	baseWidth: 40,
	annotationWidth,
	naturalLeft,
	rowTop,
});

/** Restores the absolute annotation spans implied by the solved word widths. */
const annotationSpans = (inputs: RubyWidthInput[], widths: number[]) => {
	let widenedBefore = 0;
	return inputs.map((input, index) => {
		const boxLeft = input.naturalLeft + widenedBefore;
		const left = boxLeft + (widths[index] - input.annotationWidth) / 2;
		widenedBefore += widths[index] - input.baseWidth;
		return {
			left,
			right: left + input.annotationWidth,
			rowTop: input.rowTop,
		};
	});
};

/** Asserts adjacent annotations on the same visual row keep at least `minGap`. */
const expectNoCollision = (
	inputs: RubyWidthInput[],
	widths: number[],
	minGap: number,
) => {
	const spans = annotationSpans(inputs, widths);
	for (let i = 1; i < spans.length; i++) {
		if (spans[i].rowTop !== spans[i - 1].rowTop) continue;
		expect(spans[i].left - spans[i - 1].right).toBeGreaterThanOrEqual(
			minGap - 1e-6,
		);
	}
};

describe("solveRubyWidth", () => {
	const minGap = 2;

	it("keeps words unwidened while annotations do not collide", () => {
		// 光(ひかり) and 命(いのち) are separated by unannotated kana
		const inputs = [ruby(0, 60), ruby(200, 60)];
		expect(solveRubyWidth(inputs, minGap)).toEqual([40, 40]);
	});

	it("never widens for annotations narrower than the base", () => {
		const inputs = [ruby(0, 20), ruby(40, 20)];
		expect(solveRubyWidth(inputs, minGap)).toEqual([40, 40]);
	});

	it("widens only the later word when two annotations collide", () => {
		// 語(がたり) overlaps the right edge of 物(もの)
		const inputs = [ruby(0, 40), ruby(40, 60)];
		const widths = solveRubyWidth(inputs, minGap);
		expect(widths).toEqual([40, 64]);
		expectNoCollision(inputs, widths, minGap);
	});

	it("keeps a whole run of wide annotations collision free", () => {
		const inputs = [ruby(0, 60), ruby(40, 60), ruby(80, 100)];
		const widths = solveRubyWidth(inputs, minGap);
		expectNoCollision(inputs, widths, minGap);
	});

	it("resets the collision chain on a wrapped visual row", () => {
		const inputs = [ruby(0, 60, 0), ruby(40, 60, 48)];
		expect(solveRubyWidth(inputs, minGap)).toEqual([40, 40]);
	});

	it("never narrows a word below its base width", () => {
		const inputs = [ruby(0, 40), ruby(40, 60), ruby(100, 100), ruby(140, 60)];
		const widths = solveRubyWidth(inputs, minGap);
		expectNoCollision(inputs, widths, minGap);
		inputs.forEach((input, index) => {
			expect(widths[index]).toBeGreaterThanOrEqual(input.baseWidth);
		});
	});
});
