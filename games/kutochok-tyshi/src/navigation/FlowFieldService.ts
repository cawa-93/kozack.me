import type { NavigationProfile } from '../domain/enemies/NavigationProfile';
import type { FlowField } from './FlowField';
import type { FlowFieldSet } from './FlowFieldSet';
import type { NavigationCostSnapshot } from './NavigationCostSnapshot';

export interface FlowFieldService {
  build(
    snapshot: NavigationCostSnapshot,
    profile: NavigationProfile,
  ): FlowField;

  buildAll(
    snapshot: NavigationCostSnapshot,
    profiles: readonly NavigationProfile[],
  ): FlowFieldSet;
}
