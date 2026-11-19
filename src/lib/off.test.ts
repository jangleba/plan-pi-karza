import { describe, expect, it } from "vitest";
import { parseOff } from "./off";

const hit = (o: Record<string, unknown>) => ({ code: "590", product_name: "Jogurt", brands: ["Piątnica"], nutriments: { carbohydrates_100g: 4, proteins_100g: 5 }, ...o });

describe("Open Food Facts – parsowanie", () => {
  it("mapuje produkt: id, marka, makro na 100 g, porcja", () => {
    const [f] = parseOff({ hits: [hit({ serving_quantity: "150" })] });
    expect(f).toMatchObject({ id: "off:590", name: "Jogurt", brand: "Piątnica", carb100: 4, protein100: 5, source: "off" });
    expect(f!.unit!.g).toBe(150);
  });

  it("pomija wpisy bez makro, niemożliwe (> 100 g na 100 g), bez nazwy i duplikaty", () => {
    const r = parseOff({
      hits: [
        hit({ code: "1", nutriments: { carbohydrates_100g: 4 } }),
        hit({ code: "2", nutriments: { carbohydrates_100g: 80, proteins_100g: 40 } }),
        hit({ code: "3", product_name: "" }),
        hit({ code: "4" }),
        hit({ code: "5" }), // ta sama nazwa i marka co „4”
        hit({ code: "6", nutriments: { carbohydrates_100g: "0", proteins_100g: "10,5" }, product_name: "Szynka", brands: "Sokołów, inna" }),
      ],
    });
    expect(r.map((x) => x.id)).toEqual(["off:4", "off:6"]);
    expect(r[1]).toMatchObject({ carb100: 0, protein100: 10.5, brand: "Sokołów" });
  });

  it("niepoprawna odpowiedź → pusta lista; nierealna porcja jest ignorowana", () => {
    expect(parseOff(null)).toEqual([]);
    expect(parseOff({})).toEqual([]);
    expect(parseOff({ hits: "x" })).toEqual([]);
    expect(parseOff({ hits: [hit({ serving_quantity: 1 })] })[0]!.unit).toBeUndefined();
  });
});
