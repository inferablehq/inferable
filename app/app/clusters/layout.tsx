import { Header } from "@/components/header";
import { OrgList } from "@/components/org-list";
import { auth } from "@clerk/nextjs";

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await auth();

  return (
    <>
      <main className="flex flex-col justify-stretch">
        <Header />
        <OrgList />
        {user && user.orgId && <section>{children}</section>}
      </main>
    </>
  );
}
