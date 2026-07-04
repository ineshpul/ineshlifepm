import { HeroLiveModule } from "../components/HeroLiveModule";
import { HomePageClient } from "../components/HomePageClient";
import { getMarketing } from "../lib/getMarketing";

export const dynamic = "force-dynamic";

export default async function Home() {
  let initialMarketing = null;
  let initialMarketingError: string | null = null;

  try {
    initialMarketing = await getMarketing();
  } catch {
    initialMarketingError = "Could not load today's leap.";
  }

  return (
    <HomePageClient
      heroLive={
        <HeroLiveModule
          initialMarketing={initialMarketing}
          initialMarketingError={initialMarketingError}
        />
      }
    />
  );
}
