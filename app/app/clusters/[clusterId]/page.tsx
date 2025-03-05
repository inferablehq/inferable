import { redirect } from "next/navigation";

export default function Page({ params }: { params: { clusterId: string } }) {
  redirect(`/clusters/${params.clusterId}/workflows`);
}
