// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import {
	applyRubyCollisionSpacing,
	type RubyWordLayout,
} from "#lyric/dom/ruby-spacing.ts";
import styles from "#styles/lyric-player.module.css";

/** 注音单词的模拟排版尺寸 */
interface RubySpec {
	/** 主歌词文字宽度 */
	text: number;
	/** 假名占位宽度 */
	ruby: number;
	/** 与前一个单词之间的空白宽度 */
	gap?: number;
}

const rectOf = (left: number, width: number): DOMRect =>
	({
		x: left,
		y: 0,
		left,
		top: 0,
		right: left + width,
		bottom: 10,
		width,
		height: 10,
		toJSON: () => ({}),
	}) as DOMRect;

/**
 * 构造与 LyricLineEl.createWord 同形态的注音单词，并按撑开标记模拟行内落位
 * @param specs - 每个单词的文字与假名宽度
 * @returns 交由注音排版处理的单词列表与根容器
 */
const createRubyWords = (specs: RubySpec[]) => {
	const root = document.createElement("div");
	const words: RubyWordLayout[] = [];
	const rects = new Map<HTMLElement, DOMRect>();

	const relayout = () => {
		let pen = 0;
		words.forEach((word, i) => {
			const spec = specs[i];
			pen += spec.gap ?? 0;
			const spaced = word.element.classList.contains(styles.rubySpaced);
			const boxWidth = spaced ? Math.max(spec.text, spec.ruby) : spec.text;
			const inkLeft = pen + (boxWidth - spec.ruby) / 2;
			const parts = Array.from(word.annotationBox.children) as HTMLElement[];
			const partWidth = spec.ruby / Math.max(parts.length, 1);
			parts.forEach((part, k) => {
				rects.set(part, rectOf(inkLeft + k * partWidth, partWidth));
			});
			pen += boxWidth;
		});
	};

	for (let i = 0; i < specs.length; i++) {
		const element = document.createElement("span");
		const annotationBox = document.createElement("span");
		const part = document.createElement("span");
		annotationBox.append(part);
		element.append(annotationBox);
		root.append(element);
		part.getBoundingClientRect = () => {
			relayout();
			return rects.get(part) ?? rectOf(0, 0);
		};
		words.push({ element, annotationBox });
	}
	return { root, words };
};

const spacedOf = (root: HTMLElement) =>
	[...root.children].map((child) =>
		child.classList.contains(styles.rubySpaced) ? "spaced" : "compact",
	);

describe("注音碰撞自适应排版", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("相邻假名相撞时让两侧单词退回整词计宽", () => {
		const { root, words } = createRubyWords([
			{ text: 20, ruby: 40 },
			{ text: 20, ruby: 60 },
		]);
		applyRubyCollisionSpacing(words);
		expect(spacedOf(root)).toEqual(["spaced", "spaced"]);
	});

	it("假名被空白隔开时保持紧凑", () => {
		const { root, words } = createRubyWords([
			{ text: 20, ruby: 50 },
			{ text: 20, ruby: 50, gap: 60 },
		]);
		applyRubyCollisionSpacing(words);
		expect(spacedOf(root)).toEqual(["compact", "compact"]);
	});

	it("只撑开碰撞链上的单词", () => {
		const { root, words } = createRubyWords([
			{ text: 40, ruby: 90 },
			{ text: 20, ruby: 60 },
			{ text: 20, ruby: 20, gap: 200 },
		]);
		applyRubyCollisionSpacing(words);
		expect(spacedOf(root)).toEqual(["spaced", "spaced", "compact"]);
	});

	it("判定结果与调用次数无关", () => {
		const { root, words } = createRubyWords([
			{ text: 20, ruby: 40 },
			{ text: 20, ruby: 60 },
		]);
		applyRubyCollisionSpacing(words);
		applyRubyCollisionSpacing(words);
		expect(spacedOf(root)).toEqual(["spaced", "spaced"]);
	});

	it("单个注音单词无需判定", () => {
		const { root, words } = createRubyWords([{ text: 20, ruby: 90 }]);
		applyRubyCollisionSpacing(words);
		expect(spacedOf(root)).toEqual(["compact"]);
	});
});
