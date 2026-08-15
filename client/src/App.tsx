import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import Compile from "@/pages/Compile";
import Play from "@/pages/Play";

export default function App() {
  const play =
    typeof window !== "undefined" &&
    (window.location.pathname === "/play" || window.location.hash === "#play");

  return (
    <QueryClientProvider client={queryClient}>
      {play ? <Play /> : <Compile />}
    </QueryClientProvider>
  );
}
