import {
  ajvErrorToFailures,
  blob,
  extractBlobs,
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

describe("extractBlobs", () => {
  it("should extract blobs from content", () => {
    const initialContent = {
      foo: "bar",
      bar: "foo",
      somethingElse: blob({
        name: "some blob object",
        type: "application/json",
        data: {
          test: "123",
        },
      }),
      anotherSomethingElse: blob({
        name: "another blob object",
        type: "application/json",
        data: {
          anotherTest: "456",
        },
      }),
    };

    const transformedContent = extractBlobs(initialContent);

    expect(transformedContent).toEqual({
      content: {
        foo: "bar",
        bar: "foo",
      },
      blobs: [
        {
          name: "some blob object",
          type: "application/json",
          encoding: "base64",
          size: 20,
          data: Buffer.from(
            JSON.stringify({
              test: "123",
            }),
          ).toString("base64"),
        },
        {
          name: "another blob object",
          type: "application/json",
          encoding: "base64",
          size: 28,
          data: Buffer.from(
            JSON.stringify({
              anotherTest: "456",
            }),
          ).toString("base64"),
        },
      ],
    });
  });
});
