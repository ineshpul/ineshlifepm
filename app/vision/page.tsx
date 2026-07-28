import { listAreas, listVisionItems, listGoals } from "@/lib/repo";
import { VisionClient } from "./VisionClient";

export default async function VisionPage() {
  const [areas, visionItems, goals] = await Promise.all([
    listAreas(),
    listVisionItems(),
    listGoals(),
  ]);

  return <VisionClient areas={areas} visionItems={visionItems} goals={goals} />;
}
