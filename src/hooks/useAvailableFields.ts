/**
 * useAvailableFields — 从 metadata 树收集可用字段集合(P2 自建字段闭环)
 *
 * 2026-05-17:全部纯逻辑已下沉到 core/metadata/computeAvailableFields.ts
 *   (含 I1-I5 不变量 + FOLDER/HIDDEN 排除 + group=MEASURE 兼容)。
 *   本 hook 退化为 useMemo 1 行包装,只剩 React orchestration。
 */

import { useMemo } from 'react';

import {
  type AvailableFields,
  computeAvailableFields,
} from '../core/metadata/computeAvailableFields.js';
import type { Metadata } from '../types/metadata.js';

export type { AvailableFields } from '../core/metadata/computeAvailableFields.js';

export function useAvailableFields(metadata: Metadata): AvailableFields {
  return useMemo(() => computeAvailableFields(metadata), [metadata]);
}
