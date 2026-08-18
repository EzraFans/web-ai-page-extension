/** prompt 插入到输入框已有内容的位置 */
export type InsertPosition = 'prepend' | 'append';

export interface Prompt {
  /** crypto.randomUUID() */
  id: string;
  /** 显示名，≤ 50 字符 */
  name: string;
  /** prompt 正文，≤ 6000 字符（保证 sync 单 item 8KB 配额内） */
  content: string;
  /** 插入位置：prepend = 已有内容之前，append = 之后 */
  position: InsertPosition;
  createdAt: number;
  updatedAt: number;
}

/** 索引 key 的值：记录排序，不冗余到每条 prompt（重排只写 1 次） */
export interface StorageIndex {
  version: 1;
  order: string[];
}

export interface PromptInput {
  name: string;
  content: string;
  position: InsertPosition;
}

/** 单条 prompt 校验上限 */
export const LIMITS = {
  nameMaxLength: 50,
  contentMaxLength: 6000,
} as const;

export function validatePromptInput(input: PromptInput): string | null {
  const name = input.name.trim();
  if (!name) return '名称不能为空';
  if (name.length > LIMITS.nameMaxLength) return `名称不能超过 ${LIMITS.nameMaxLength} 字符`;
  if (!input.content.trim()) return '内容不能为空';
  if (input.content.length > LIMITS.contentMaxLength) {
    return `内容不能超过 ${LIMITS.contentMaxLength} 字符`;
  }
  return null;
}
