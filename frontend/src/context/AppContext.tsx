import React, { createContext, useContext, useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/src/lib/supabase";
import { api } from "@/src/lib/api";

type Me = {
  user_id: string;
  email: string;
  is_admin: boolean;
  workspace: any;
  brand: any;
  subscription: any;
};

type Ctx = {
  session: Session | null;
  initializing: boolean;
  me: Me | null;
  brand: any;
  primaryColor: string;
  refreshMe: () => void;
  signOut: () => Promise<void>;
};

const AppCtx = createContext<Ctx>({} as Ctx);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitializing(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      qc.invalidateQueries({ queryKey: ["me"] });
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  const meQuery = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => api.get("/me"),
    enabled: !!session,
    staleTime: 30_000,
  });

  const me = meQuery.data ?? null;
  const brand = me?.brand ?? null;
  const primaryColor = brand?.primary_color || "#E21B2D";

  const signOut = async () => {
    await supabase.auth.signOut();
    qc.clear();
  };

  return (
    <AppCtx.Provider
      value={{
        session,
        initializing,
        me,
        brand,
        primaryColor,
        refreshMe: () => qc.invalidateQueries({ queryKey: ["me"] }),
        signOut,
      }}
    >
      {children}
    </AppCtx.Provider>
  );
}
