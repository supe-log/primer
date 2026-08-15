import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import Compile from "@/pages/Compile";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Compile />
    </QueryClientProvider>
  );
}
