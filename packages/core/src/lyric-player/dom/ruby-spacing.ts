/**
 * 词内注音的防相撞排版
 *
 * 注音盒默认零宽溢出，主歌词字距不受假名宽度影响；相邻假名即将相撞时，
 * 把后一个单词撑宽到刚好让出最小间距，其余情况保持溢出。
 *
 * 撑宽走注音盒自身宽度而非外边距，依赖两条约定：
 * 假名在单词内容盒内居中（.wordWithRuby 的 align-items 与 .rubyWord 的 justify-content），
 * 且逐词遮罩按词宽累加推算位置，只有让词宽真实变大两者才继续成立。
 */

/** 注音排版所需的最小单词结构 */
interface RubyWordLike {
	/** 单词外层元素 */
	mainElement: HTMLSpanElement;
	/** 单词的注音层元素，无注音时为 null */
	rubyElement: HTMLSpanElement | null;
}

/**
 * 注音撑宽求解的输入，全部为脱离 DOM 的纯几何量
 * 尺寸取零撑宽（注音盒宽度归零）布局下的值，该基准与已写出的撑宽量无关，求解因此幂等
 */
export interface RubyWidthInput {
	/** 零撑宽时单词自身的内容宽度 */
	baseWidth: number;
	/** 假名自然排开后的并集宽度 */
	annotationWidth: number;
	/** 零撑宽时单词边框盒的水平起点 */
	naturalLeft: number;
	/** 零撑宽时单词所在视觉行的纵坐标 */
	rowTop: number;
}

/** 注音单词的测量数据：DOM 引用加求解输入 */
interface RubyWordMeasurement {
	word: RubyWordLike;
	input: RubyWidthInput;
}

/** 相邻假名的最小间距占主字号的比例 */
const ANNOTATION_GAP_RATIO = 0.05;

/** 注音撑宽量的 CSS 变量名 */
const RUBY_WIDTH_VAR = "--amll-lp-ruby-width";

/**
 * 清零撑宽变量后量出主文本与假名尺寸
 * 先批量写再批量读，避免逐词读写交替引发多次强制回流
 * @param words 行内全部单词
 * @returns 仅含注音的单词测量数据，按文档顺序排列
 */
const measureRubyWords = (words: RubyWordLike[]): RubyWordMeasurement[] => {
	const rubyWords = words.filter((word) => word.rubyElement);
	if (rubyWords.length === 0) {
		return [];
	}

	for (const word of rubyWords) {
		word.mainElement.style.removeProperty(RUBY_WIDTH_VAR);
	}

	const padding =
		Number.parseFloat(getComputedStyle(rubyWords[0].mainElement).paddingLeft) ||
		0;
	// 回流一次：撑宽归零后单词内容盒即主文本宽度
	const measurements: RubyWordMeasurement[] = rubyWords.map((word) => {
		const rect = word.mainElement.getBoundingClientRect();
		return {
			word,
			input: {
				baseWidth: word.mainElement.clientWidth - padding * 2,
				annotationWidth: 0,
				naturalLeft: rect.left,
				rowTop: Math.round(rect.top),
			},
		};
	});
	// 回流一次：零宽注音盒内的假名按自身尺寸排开，取并集即为假名实际占位
	for (const measurement of measurements) {
		let left = Number.POSITIVE_INFINITY;
		let right = Number.NEGATIVE_INFINITY;
		for (const part of measurement.word.rubyElement?.children ?? []) {
			const rect = part.getBoundingClientRect();
			left = Math.min(left, rect.left);
			right = Math.max(right, rect.right);
		}
		measurement.input.annotationWidth = Number.isFinite(left)
			? right - left
			: 0;
	}

	return measurements;
};

/**
 * 按文档顺序分配撑宽量，只给会撞上相邻假名的单词让位
 *
 * 假名在撑宽后的单词盒内居中，故让位 d 需把单词撑宽 2d。撑宽只会让行变宽，
 * 可能使后序单词延后换行而落到不同行，故按 rowTop 分行重置相撞链，跨行互不约束。
 * @param inputs 按文档顺序排列的注音单词几何数据
 * @param minGap 相邻假名的最小间距
 * @returns 与输入等长的单词内容宽度
 */
export const solveRubyWidth = (
	inputs: RubyWidthInput[],
	minGap: number,
): number[] => {
	const widths: number[] = [];
	/** 本词之前全部单词已累计撑出的宽度 */
	let widenedBefore = 0;
	let prevRowTop = Number.NaN;
	let prevAnnotationRight = Number.NEGATIVE_INFINITY;

	for (const input of inputs) {
		let width = input.baseWidth;
		if (input.rowTop !== prevRowTop) {
			prevRowTop = input.rowTop;
			prevAnnotationRight = Number.NEGATIVE_INFINITY;
		}

		const boxLeft = input.naturalLeft + widenedBefore;
		let annotationLeft = boxLeft + (width - input.annotationWidth) / 2;
		const deficit = prevAnnotationRight + minGap - annotationLeft;
		if (deficit > 0) {
			width += deficit * 2;
			annotationLeft += deficit;
		}

		prevAnnotationRight = annotationLeft + input.annotationWidth;
		widenedBefore += width - input.baseWidth;
		widths.push(width);
	}

	return widths;
};

/**
 * 让相邻注音互不相撞：量出假名占位后写出各词的撑宽量
 * @param words 行内全部单词
 */
export const applyRubySpacing = (words: RubyWordLike[]): void => {
	const measurements = measureRubyWords(words);
	if (measurements.length === 0) {
		return;
	}

	const fontSize =
		Number.parseFloat(
			getComputedStyle(measurements[0].word.mainElement).fontSize,
		) || 0;
	const widths = solveRubyWidth(
		measurements.map((measurement) => measurement.input),
		fontSize * ANNOTATION_GAP_RATIO,
	);

	measurements.forEach((measurement, index) => {
		measurement.word.mainElement.style.setProperty(
			RUBY_WIDTH_VAR,
			`${widths[index].toFixed(2)}px`,
		);
	});
};
