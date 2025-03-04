// the contract is availble in @/client/contract import { client } from
"@/client/client";

function MachinesOverview({ clusterId }: { clusterId: string }) { const
[machines, setMachines] = useState< ClientInferResponseBody<typeof
contract.listMachines, 200>

> ([]); const [liveMachineCount, setLiveMachineCount] = useState(0); const {
> getToken } = useAuth(); const [error, setError] = useState<any>(null);

const getClusterMachines = useCallback(async () => { const machinesResponse =
await client.listMachines({ headers: { authorization:
`Bearer ${await getToken()}`, }, params: { clusterId, }, });

    if (machinesResponse.status === 200) {
      setMachines(machinesResponse.body);
      setLiveMachineCount(
        machinesResponse.body.filter(
          (m) => Date.now() - new Date(m.lastPingAt!).getTime() < 1000 * 60,
        ).length,
      );
    } else {
      setError(machinesResponse);
    }

}, [clusterId, getToken]);

useEffect(() => { getClusterMachines();

    const interval = setInterval(getClusterMachines, 1000 * 10);
    return () => clearInterval(interval);

}, [getClusterMachines]);

if (error) { return <ErrorDisplay status={error.status} error={error} />; }

// the rest }
