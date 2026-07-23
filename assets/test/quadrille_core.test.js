import { test } from "node:test"
import assert from "node:assert/strict"

import { shouldLoadWindow, clampResizeDelta, reconcileWidths } from "../js/quadrille_core.js"

test("shouldLoadWindow: false when the viewport sits inside the buffer", () => {
  assert.equal(
    shouldLoadWindow({
      firstVisible: 500,
      viewportRows: 20,
      offset: 480,
      limit: 60,
      totalCount: 100000,
      margin: 10,
    }),
    false,
  )
})

test("shouldLoadWindow: true near the bottom edge with more data below", () => {
  assert.equal(
    shouldLoadWindow({
      firstVisible: 525,
      viewportRows: 20,
      offset: 480,
      limit: 60,
      totalCount: 100000,
      margin: 10,
    }),
    true,
  )
})

test("shouldLoadWindow: no bottom request at the end of the dataset", () => {
  // offset + limit == totalCount -> nothing more below
  assert.equal(
    shouldLoadWindow({
      firstVisible: 990,
      viewportRows: 20,
      offset: 940,
      limit: 60,
      totalCount: 1000,
      margin: 10,
    }),
    false,
  )
})

test("shouldLoadWindow: no top request when already at offset 0", () => {
  assert.equal(
    shouldLoadWindow({
      firstVisible: 0,
      viewportRows: 20,
      offset: 0,
      limit: 60,
      totalCount: 100000,
      margin: 10,
    }),
    false,
  )
})

test("shouldLoadWindow: true near the top edge when scrolled up into overscan", () => {
  assert.equal(
    shouldLoadWindow({
      firstVisible: 205,
      viewportRows: 20,
      offset: 200,
      limit: 60,
      totalCount: 100000,
      margin: 10,
    }),
    true,
  )
})

test("clampResizeDelta: passes through a delta that fits", () => {
  // grow by 30: neighbor has 160-40=120 slack; self has room -> unclamped
  assert.equal(clampResizeDelta(30, 200, 160, 40, 40), 30)
})

test("clampResizeDelta: growth capped by the neighbor's slack", () => {
  // neighbor 160, min 40 -> at most +120 even though 500 was requested
  assert.equal(clampResizeDelta(500, 200, 160, 40, 40), 120)
})

test("clampResizeDelta: shrink capped by the column's own minimum", () => {
  // self 200, min 40 -> at most -160
  assert.equal(clampResizeDelta(-500, 200, 160, 40, 40), -160)
})

test("clampResizeDelta: fill neighbor uses its own floor as the minimum", () => {
  // neighbor (fill) rendered 358, floor 100 -> at most +258
  assert.equal(clampResizeDelta(999, 160, 358, 40, 100), 258)
})

test("reconcileWidths: leaves widths untouched when they already fit", () => {
  assert.deepEqual(reconcileWidths([90, 200, 150, 160], 858, 40), [90, 200, 150, 160])
})

test("reconcileWidths: shrinks to fit and never goes below the minimum", () => {
  // The exact bug case: one huge column, small ones must not force an overflow.
  const fitted = reconcileWidths([90, 5000, 150, 160], 858, 40)
  const sum = fitted.reduce((a, b) => a + b, 0)
  assert.ok(sum <= 858, `sum ${sum} should fit budget 858`)
  assert.ok(
    fitted.every((w) => w >= 40),
    `all widths >= 40, got ${fitted}`,
  )
  // The wide column absorbs most of the shrink; the small ones pin at the floor.
  assert.deepEqual(fitted, [40, 738, 40, 40])
})

test("reconcileWidths: returns integer widths", () => {
  const fitted = reconcileWidths([333, 333, 333], 500, 40)
  assert.ok(
    fitted.every((w) => Number.isInteger(w)),
    `all integers, got ${fitted}`,
  )
  assert.ok(fitted.reduce((a, b) => a + b, 0) <= 500)
})

test("reconcileWidths: a zero budget leaves widths unchanged (avoids nonsense)", () => {
  assert.deepEqual(reconcileWidths([90, 200], 0, 40), [90, 200])
})
