import { z } from "zod";
import { Inferable } from "../Inferable";

export const createServices = async (inferable: Inferable): Promise<void> => {
  const service = inferable.service({
    name: "testService",
  });

  const fakeLoans = [
    {
      id: "loan-123",
      customerId: "customer-123",
      amount: 1000,
      status: "active",
      assetClasses: ["123", "456"],
    },
    {
      id: "loan-124",
      customerId: "customer-123",
      amount: 2000,
      status: "active",
      assetClasses: ["456", "789"],
    },
    {
      id: "loan-125",
      customerId: "customer-124",
      amount: 3000,
      status: "active",
      assetClasses: ["123", "789"],
    },
  ];

  service.register({
    name: "getLoansForCustomer",
    schema: {
      input: z.object({
        customerId: z.string(),
      }),
    },
    func: async ({ customerId }) => {
      return {
        records: fakeLoans
          .filter((loan) => loan.customerId === customerId)
          .map((loan) => ({
            id: loan.id,
          })),
      };
    },
  });

  service.register({
    name: "getLoanDetails",
    schema: {
      input: z.object({
        loanId: z.string(),
      }),
    },
    func: async ({ loanId }) => {
      return fakeLoans.find((loan) => loan.id === loanId);
    },
  });

  service.register({
    name: "getAssetClassDetails",
    schema: {
      input: z.object({
        assetClass: z.string(),
      }),
    },
    func: async ({ assetClass }) => {
      if (assetClass === "123") {
        return {
          name: "property",
          risk: "low",
        };
      }

      if (assetClass === "456") {
        return {
          name: "government-bonds",
          risk: "very low",
        };
      }

      if (assetClass === "789") {
        return {
          name: "meme-coins",
          risk: "high",
        };
      }
    },
  });

  await service.start();
};
