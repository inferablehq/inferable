import {
  ajvErrorToFailures,
  extractInterrupt,
  Interrupt,
  validateFunctionSchema,
} from "./util";

describe("validateFunctionSchema", () => {
  it("should fail for empty schema", () => {
    expect(validateFunctionSchema({} as any)).toEqual([
      {
        path: "",
        error: "Schema must be defined",
      },
    ]);
  });
  it("return property name errors", () => {
    expect(
      validateFunctionSchema({
        properties: {
          "name-with-dashes": {
            type: "string",
          },
          object: {
            type: "object",
            properties: {
              "another-name-with-dashes": {
                type: "string",
              },
            },
          },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).toEqual([
      {
        path: "name-with-dashes",
        error:
          "Property name must only contain letters, numbers and underscore '_'. Got: name-with-dashes",
      },
      {
        path: "another-name-with-dashes",
        error:
          "Property name must only contain letters, numbers and underscore '_'. Got: another-name-with-dashes",
      },
    ]);
  });
});

describe("ajvErrorToFailures", () => {
  it("should extract failures from AJV error", () => {
    expect(
      ajvErrorToFailures(
        new Error(
          "schema is invalid: /data/properties/name some error message",
        ),
      ),
    ).toEqual([
      {
        path: "/data/properties/name",
        error: "some error message",
      },
    ]);
  });
});

describe("extractInterrupt", () => {
  it("should extract extract interrupt", () => {
    const interrupt = extractInterrupt(Interrupt.approval());
    expect(interrupt).toEqual({
      type: "approval",
    })
  })

  it("should not extract interrupt from non-interrupt", () => {
    const interrupt = extractInterrupt({ foo: "bar" });
    expect(interrupt).toBeUndefined();
  })
});
