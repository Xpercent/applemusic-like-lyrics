import styles from "#styles/lyric-player.module.css";

/** 相邻注音假名之间保留的最小间距（像素），实测间距小于该值即判定为碰撞 */
const RUBY_MIN_GAP = 0.5;

/**
 * 碰撞判定的最大轮次
 * 每轮量一次几何，撑开注音后可能引发重新换行，多留轮次以保证最终收敛
 */
const RUBY_COLLISION_MAX_PASSES = 3;

/** 注音单词的排版单元 */
export interface RubyWordLayout {
	/** 单词外层元素，撑开标记挂在该元素上 */
	element: HTMLElement;
	/** 承载假名的容器，紧凑排版下宽度为零，假名向两侧溢出 */
	annotationBox: HTMLElement;
}

/** 注音假名在页面中的占位区间 */
interface RubyBand {
	word: RubyWordLayout;
	left: number;
	right: number;
	top: number;
	bottom: number;
}

/**
 * 合并词内所有假名的实测占位区间
 * @param word - 注音单词
 * @returns 占位区间；量不到有效尺寸（如元素未挂载）时返回 undefined
 */
const readRubyBand = (word: RubyWordLayout): RubyBand | undefined => {
	let left = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	let top = Number.POSITIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;
	for (const child of word.annotationBox.children) {
		const rect = child.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) continue;
		left = Math.min(left, rect.left);
		right = Math.max(right, rect.right);
		top = Math.min(top, rect.top);
		bottom = Math.max(bottom, rect.bottom);
	}
	if (left >= right || top >= bottom) return undefined;
	return { word, left, right, top, bottom };
};

/**
 * 判断两块注音占位是否相交：横向交叠且纵向同处一行
 * @param a - 靠左的占位区间
 * @param b - 靠右的占位区间
 */
const isRubyCollision = (a: RubyBand, b: RubyBand) =>
	a.left < b.right - RUBY_MIN_GAP &&
	b.left < a.right - RUBY_MIN_GAP &&
	a.top < b.bottom &&
	b.top < a.bottom;

/**
 * 收集一行内发生碰撞的注音单词
 * @param bands - 按左边界排序后的占位区间
 */
const collectRubyCollisions = (bands: RubyBand[]) => {
	const collided = new Set<RubyWordLayout>();
	for (let i = 0; i < bands.length; i++) {
		const current = bands[i];
		for (
			let j = i + 1;
			j < bands.length && bands[j].left < current.right - RUBY_MIN_GAP;
			j++
		) {
			if (isRubyCollision(current, bands[j])) {
				collided.add(current.word);
				collided.add(bands[j].word);
			}
		}
	}
	return collided;
};

/**
 * 按实测几何校正注音排版：假名相撞的单词退回整词计宽，把主歌词间距撑开
 *
 * 紧凑排版下宽注音只溢出到相邻字上，撑开只会把同行后续内容推远、
 * 不会制造新的碰撞，因此逐轮量测即可收敛。
 * @param words - 行内的注音单词，按文档顺序排列
 */
export const applyRubyCollisionSpacing = (words: RubyWordLayout[]): void => {
	if (words.length < 2) return;

	// 先全部回到紧凑态再量，避免上一次判定留下的撑开量掩盖本次的碰撞
	for (const word of words) {
		word.element.classList.remove(styles.rubySpaced);
	}

	const spaced = new Set<RubyWordLayout>();
	for (let pass = 0; pass < RUBY_COLLISION_MAX_PASSES; pass++) {
		const bands: RubyBand[] = [];
		for (const word of words) {
			const band = readRubyBand(word);
			if (band) bands.push(band);
		}
		bands.sort((a, b) => a.left - b.left);

		let changed = false;
		for (const word of collectRubyCollisions(bands)) {
			if (spaced.has(word)) continue;
			spaced.add(word);
			word.element.classList.add(styles.rubySpaced);
			changed = true;
		}
		if (!changed) return;
	}
};
