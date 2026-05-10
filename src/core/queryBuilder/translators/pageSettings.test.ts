/**
 * buildPageSettings 测试
 */

import { describe, expect, it } from 'vitest';

import { defaultPageState } from '../../../fixtures/builders.js';

import { buildPageSettings } from './pageSettings.js';

describe('buildPageSettings', () => {
  it('should produce default flags + propagate page state', () => {
    const settings = buildPageSettings(defaultPageState);

    expect(settings).toEqual({
      compressEmptyRows: true,
      compressEmptyColumns: true,
      rowPageNo: 1,
      rowPageSize: 50,
      columnPageNo: 1,
      columnPageSize: 50,
      showGrandTotal: true,
      subTotalAtEnd: true,
      isCrossTable: true,
      totalAtEnd: 'true,true',
      useFormat: true,
      useDataType: true,
      useTransform: true,
      handleSpecial: true,
      isAsyncQueryColumnHeader: false,
    });
  });

  it('should propagate non-default page state', () => {
    const settings = buildPageSettings({
      rowPageNo: 3,
      rowPageSize: 20,
      columnPageNo: 2,
      columnPageSize: 10,
    });

    expect(settings).toMatchObject({
      rowPageNo: 3,
      rowPageSize: 20,
      columnPageNo: 2,
      columnPageSize: 10,
    });
  });

  it('asyncColumnHeader=true → isAsyncQueryColumnHeader=true (P2)', () => {
    const settings = buildPageSettings({
      ...defaultPageState,
      asyncColumnHeader: true,
    });
    expect(settings.isAsyncQueryColumnHeader).toBe(true);
  });

  it('asyncColumnHeader 不传 → 默认 false (向后兼容)', () => {
    const settings = buildPageSettings(defaultPageState);
    expect(settings.isAsyncQueryColumnHeader).toBe(false);
  });

  describe('P3 总计/小计开关', () => {
    it('showGrandTotal=false 显式关闭 → 输出 false', () => {
      const settings = buildPageSettings({
        ...defaultPageState,
        showGrandTotal: false,
      });
      expect(settings.showGrandTotal).toBe(false);
    });

    it('subTotalAtEnd=false 显式关闭 → 输出 false', () => {
      const settings = buildPageSettings({
        ...defaultPageState,
        subTotalAtEnd: false,
      });
      expect(settings.subTotalAtEnd).toBe(false);
    });

    it('showGrandTotal/subTotalAtEnd 不传 → 默认 true(向后兼容老 viewConfig)', () => {
      const settings = buildPageSettings(defaultPageState);
      expect(settings.showGrandTotal).toBe(true);
      expect(settings.subTotalAtEnd).toBe(true);
    });

    it('showGrandTotal=true 显式开 → 输出 true(对称语义)', () => {
      const settings = buildPageSettings({
        ...defaultPageState,
        showGrandTotal: true,
        subTotalAtEnd: true,
      });
      expect(settings.showGrandTotal).toBe(true);
      expect(settings.subTotalAtEnd).toBe(true);
    });

    it('showGrandTotal=false → totalAtEnd 联动改 "false,false"(否则后端按 totalAtEnd 仍生成总计)', () => {
      const settings = buildPageSettings({
        ...defaultPageState,
        showGrandTotal: false,
      });
      expect(settings.showGrandTotal).toBe(false);
      expect(settings.totalAtEnd).toBe('false,false');
    });

    it('showGrandTotal 默认/true → totalAtEnd="true,true"', () => {
      expect(buildPageSettings(defaultPageState).totalAtEnd).toBe('true,true');
      expect(
        buildPageSettings({ ...defaultPageState, showGrandTotal: true }).totalAtEnd,
      ).toBe('true,true');
    });
  });
});
