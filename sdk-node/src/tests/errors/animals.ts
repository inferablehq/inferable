import { z } from "zod";
import { inferableInstance } from "../utils";

export const getNormalAnimal = async () => {
  throw new Error("This is a normal error");
};

export class AnimalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnimalError";
  }
}

export const getCustomAnimal = async () => {
  throw new AnimalError("This is a custom error");
};

export const animalService = () => {
  const prefix = `animal${Math.random().toString(36).substring(2, 5)}`;
  const client = inferableInstance()

  client.tools.register ({
    name: `${prefix}_getNormalAnimal`,
    func: getNormalAnimal,
    schema: {
      input: z.object({}),
    },
  });

  client.tools.register({
    name: `${prefix}_getCustomAnimal`,
    func: getCustomAnimal,
    schema: {
      input: z.object({}),
    },
  });

  return {
    client,
    prefix
  }
}
