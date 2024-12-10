import { dereferenceSync, JSONSchema } from "dereference-json-schema";
import { InvalidJobArgumentsError, InvalidServiceRegistrationError } from "../utilities/errors";
import { packer } from "./packer";
import {
  deserializeFunctionSchema,
  embeddableServiceFunction,
  parseJobArgs,
  serviceFunctionEmbeddingId,
  updateServiceEmbeddings,
  validateServiceRegistration,
} from "./service-definitions";
import { createOwner } from "./test/util";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";
describe("updateServiceEmbeddings", () => {
  let owner: { clusterId: string };
  beforeAll(async () => {
    owner = await createOwner();
  });

  it("should store and update service embeddings", async () => {
    await updateServiceEmbeddings({
      service: {
        name: "testService",
        functions: [
          {
            name: "testFn",
            description: "testFn",
            schema: "{}",
          },
        ],
      },
      clusterId: owner.clusterId,
    });

    const result = await embeddableServiceFunction.getEmbeddingsGroup(
      owner.clusterId,
      "service-function",
      "testService",
    );

    expect(result).toHaveLength(1);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: serviceFunctionEmbeddingId({
            serviceName: "testService",
            functionName: "testFn",
          }),
        }),
      ]),
    );

    // Adds a second function
    await updateServiceEmbeddings({
      service: {
        name: "testService",
        functions: [
          {
            name: "testFn",
            description: "testFn",
            schema: "{}",
          },
          {
            name: "testFn2",
            description: "testFn2",
            schema: "{}",
          },
        ],
      },
      clusterId: owner.clusterId,
    });

    const result2 = await embeddableServiceFunction.getEmbeddingsGroup(
      owner.clusterId,
      "service-function",
      "testService",
    );

    expect(result2).toHaveLength(2);
    expect(result2).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: serviceFunctionEmbeddingId({
            serviceName: "testService",
            functionName: "testFn",
          }),
        }),
        expect.objectContaining({
          id: serviceFunctionEmbeddingId({
            serviceName: "testService",
            functionName: "testFn2",
          }),
        }),
      ]),
    );

    // Removes a function
    await updateServiceEmbeddings({
      service: {
        name: "testService",
        functions: [
          {
            name: "testFn",
            description: "testFn",
            schema: "{}",
          },
        ],
      },
      clusterId: owner.clusterId,
    });

    const result3 = await embeddableServiceFunction.getEmbeddingsGroup(
      owner.clusterId,
      "service-function",
      "testService",
    );

    expect(result3).toHaveLength(1);
    expect(result3).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: serviceFunctionEmbeddingId({
            serviceName: "testService",
            functionName: "testFn",
          }),
        }),
      ]),
    );

    // Renames a function
    await updateServiceEmbeddings({
      service: {
        name: "testService",
        functions: [
          {
            name: "testFn2",
            description: "testFn2",
            schema: "{}",
          },
        ],
      },
      clusterId: owner.clusterId,
    });

    const result4 = await embeddableServiceFunction.getEmbeddingsGroup(
      owner.clusterId,
      "service-function",
      "testService",
    );

    expect(result4).toHaveLength(1);
    expect(result4).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: serviceFunctionEmbeddingId({
            serviceName: "testService",
            functionName: "testFn2",
          }),
        }),
      ]),
    );
  });
});

describe("parseJobArgs", () => {
  it("should reject if input is not an object", async () => {
    await expect(() =>
      parseJobArgs({
        args: packer.pack([{}]),
        schema: "{}",
      }),
    ).rejects.toEqual(
      new InvalidJobArgumentsError("Argument must be an object"),
    );
  });

  it("should reject if input is not an object", async () => {
    await expect(() =>
      parseJobArgs({
        args: packer.pack(1),
        schema: "{}",
      }),
    ).rejects.toEqual(
      new InvalidJobArgumentsError("Argument must be an object"),
    );
  });

  it("should reject if input is invalid", async () => {
    await expect(() =>
      parseJobArgs({
        schema:
          '{"type":"object","properties":{"someString":{"type":"string"},"someNestedObject":{"type":"object","properties":{"someNumber":{"type":"number"}}}},"required":["someString","someNestedObject"]}',
        args: packer.pack({}),
      }),
    ).rejects.toEqual(
      new InvalidJobArgumentsError(
        'instance requires property "someString", instance requires property "someNestedObject"',
      ),
    );
  });

  it("should resolve if schema is found and args are valid", async () => {
    await parseJobArgs({
      schema:
        '{"type":"object","properties":{"someString":{"type":"string"},"someNestedObject":{"type":"object","properties":{"someNumber":{"type":"number"}}}},"required":["someString","someNestedObject"]}',
      args: packer.pack({
        someString: "someString",
        someNestedObject: {
          someNumber: 1,
        },
      }),
    });
  });
});

describe("deserializeFunctionSchema", () => {
  const jsonSchema = {
    $schema: "http://json-schema.org/draft-04/schema#",
    title: "ExtractResult",
    type: "object",
    additionalProperties: false,
    properties: {
      posts: {
        type: "array",
        items: {
          $ref: "#/definitions/Post",
        },
      },
    },
    definitions: {
      Post: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: {
            type: "string",
          },
          title: {
            type: "string",
          },
          points: {
            type: "string",
          },
          comments_url: {
            type: "string",
          },
        },
      },
    },
  };

  it("should convert a JSON schema to a Zod schema", () => {
    const zodSchema = deserializeFunctionSchema(
      dereferenceSync(jsonSchema as any),
    );
    const jsonSchema2 = zodToJsonSchema(zodSchema);
    const dereferenced = dereferenceSync(jsonSchema2 as JSONSchema);
    expect(dereferenced).toMatchObject({
      properties: {
        posts: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: {
                type: "string",
              },
              title: {
                type: "string",
              },
              points: {
                type: "string",
              },
              comments_url: {
                type: "string",
              },
            },
          },
        },
      },
    });
  });
});

describe("validateServiceRegistration", () => {
  it("should reject invalid schema", () => {
    expect(() => {
      validateServiceRegistration({
        service: "default",
        definition: {
          name: "default",
          functions: [
            {
              name: "someFn",
              schema: JSON.stringify({
                type: "wrong_type",
              })
            },
          ],
        },
      });
    }).toThrow(InvalidServiceRegistrationError);
  })

  it("should accept valid schema", () => {
    expect(() => {
      validateServiceRegistration({
        service: "default",
        definition: {
          name: "default",
          functions: [
            {
              name: "someFn",
              description: "someFn",
              schema: JSON.stringify(zodToJsonSchema(
                z.object({
                  test: z.string(),
                })
              ))
            },
          ],
        },
      });
    }).not.toThrow();
  })

  it("should reject incorrect handleCustomerAuth registration", () => {
    expect(() => {
      validateServiceRegistration({
        service: "default",
        definition: {
          name: "default",
          functions: [
            {
              name: "handleCustomerAuth",
              description: "handleCustomerAuth",
              schema: JSON.stringify(zodToJsonSchema(
                z.object({
                  test: z.string(),
                })
              )),
            },
          ],
        },
      });
    }).toThrow(InvalidServiceRegistrationError);
  })

  it("should accept valid handleCustomerAuth registration", () => {
    expect(() => {
      validateServiceRegistration({
        service: "default",
        definition: {
          name: "default",
          functions: [
            {
              name: "handleCustomerAuth",
              description: "handleCustomerAuth",
              schema: JSON.stringify(zodToJsonSchema(
                z.object({
                  token: z.string(),
                })
              ))
            },
          ],
        },
      });
    }).not.toThrow();
  })

  it("should reject invalid cache.keyPath jsonpath", () => {
    expect(() => {
      validateServiceRegistration({
        service: "default",
        definition: {
          name: "default",
          functions: [
            {
              name: "myFn",
              config: {
                cache: {
                  keyPath: "$invalid",
                  ttlSeconds: 10
                }
              }
            },
          ],
        },
      });
    }).toThrow(InvalidServiceRegistrationError);
  })

  it("should accept valid cache.keyPath jsonpath", () => {
    expect(() => {
      validateServiceRegistration({
        service: "default",
        definition: {
          name: "default",
          functions: [
            {
              name: "myFn",
              config: {
                cache: {
                  keyPath: "$.someKey",
                  ttlSeconds: 10
                }
              }
            },
          ],
        },
      });
    }).not.toThrow();
  })
})
