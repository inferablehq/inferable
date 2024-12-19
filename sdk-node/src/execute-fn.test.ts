import { executeFn } from "./execute-fn";
import { Interrupt } from "./util";

describe("executeFn", () => {
  it("should run a function with arguments", async () => {
    const fn = (val: { [key: string]: string }) => Promise.resolve(val.foo);
    const result = await executeFn(fn, [{foo: "bar"}] as any);
    expect(result).toEqual({
      content: "bar",
      type: "resolution",
      functionExecutionTime: expect.any(Number),
    });
  });

  it("should extract interrupt from resolution", async () => {
    const fn = (_: string) => Promise.resolve(Interrupt.approval());
    const result = await executeFn(fn, [{}] as any);
    expect(result).toEqual({
      content: { type: "approval" },
      type: "interrupt",
      functionExecutionTime: expect.any(Number),
    });
  });

  it("should extract interrupt from rejection", async () => {
    const fn = () => Promise.reject(Interrupt.approval());
    const result = await executeFn(fn, [{}] as any);
    expect(result).toEqual({
      content: { type: "approval" },
      type: "interrupt",
      functionExecutionTime: expect.any(Number),
    });
  });
});
