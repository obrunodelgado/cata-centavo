import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  centsToBRL,
  centsToBRLShort,
  centsToSignedBRL,
  chartNumber,
  percentBRL,
} from "../../apps/web/lib/money.ts";

describe("lib/money — pt-BR formatting over integer cents", () => {
  // Intl pt-BR separates R$ from the figure with a non-breaking space; the
  // tests pin the exact output so a locale regression cannot pass silently.
  const nbsp = "\u00A0";

  it("formats cents as pt-BR currency", () => {
    assert.equal(centsToBRL(1843210), `R$${nbsp}18.432,10`);
    assert.equal(centsToBRL(984000), `R$${nbsp}9.840,00`);
    assert.equal(centsToBRL(123456), `R$${nbsp}1.234,56`);
    assert.equal(centsToBRL(5), `R$${nbsp}0,05`);
  });

  it("never blanks a zero balance", () => {
    assert.equal(centsToBRL(0), `R$${nbsp}0,00`);
  });

  it("formats negatives with the prototype's minus sign", () => {
    assert.equal(centsToBRL(-721435), `−R$${nbsp}7.214,35`);
  });

  it("formats signed values with an explicit sign", () => {
    assert.equal(centsToSignedBRL(984000), `+R$${nbsp}9.840,00`);
    assert.equal(centsToSignedBRL(-721435), `−R$${nbsp}7.214,35`);
    assert.equal(centsToSignedBRL(0), `+R$${nbsp}0,00`);
  });

  it("formats percentages pt-BR, one decimal, null as an em dash", () => {
    assert.equal(percentBRL(26.683333), "26,7%");
    assert.equal(percentBRL(0), "0,0%");
    assert.equal(percentBRL(-3.14), "−3,1%");
    assert.equal(percentBRL(null), "—");
  });

  it("formats compact thousands the way the prototype's hbars do", () => {
    assert.equal(centsToBRLShort(2990000), "R$ 29,9 mil");
    assert.equal(centsToBRLShort(4823000), "R$ 48,2 mil");
    assert.equal(centsToBRLShort(482300000), "R$ 4,8 mi");
    assert.equal(centsToBRLShort(482), `R$${nbsp}4,82`);
    assert.equal(centsToBRLShort(0), `R$${nbsp}0,00`);
  });

  it("chartNumber is a presentation-only cents → float conversion", () => {
    // The only float in the whole pipeline, used solely as SVG geometry input.
    assert.equal(chartNumber(1843210), 18432.1);
    assert.equal(chartNumber(-721435), -7214.35);
    assert.equal(chartNumber(0), 0);
  });
});
