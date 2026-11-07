export const DISTANCE_STEP=100;
export const DISTANCE_MAX=3000;
export const createDistanceHistogram=()=>Array(DISTANCE_MAX/DISTANCE_STEP).fill(0);
export function addDistancePopulation(bins,metres,population){
  if(Number.isFinite(metres)&&metres>=0&&metres<DISTANCE_MAX&&Number.isFinite(population)&&population>0)bins[Math.floor(metres/DISTANCE_STEP)]+=population;
}
