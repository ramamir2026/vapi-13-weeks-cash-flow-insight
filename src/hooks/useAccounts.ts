import { useQuery } from "@tanstack/react-query";
import { loadAccounts, type AccountRow } from "@/lib/accounts";

export const useAccounts = () =>
  useQuery<AccountRow[]>({
    queryKey: ["accounts"],
    queryFn: loadAccounts,
    staleTime: 5 * 60_000,
  });
