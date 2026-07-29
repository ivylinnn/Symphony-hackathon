/* eslint-disable max-lines-per-function */

import {
  KsIconAiGeneration,
  KsIconHome,
  KsIconPeople,
  KsIconTips,
  KsIconTransitions,
  KsIconVideoCollection
} from '@fe-infra/keystone-icons-react';

import { useMiniappPermissionContext } from '@/components/AuthProvider/hooks/auth/useMiniappPermission';
import { CueMiniApp, FoundationMap } from '@/const/app';
import { useOnboardContext } from '@/contexts/onboarding';
import type { MenuItem } from '@/hooks/miniappMenu/MenuContext';
import useAgentAllowList from '@/hooks/useAgentAllowList';
import { useGenerateActions } from '@/store/generate';

// import { useAppForbiddenModal } from '../showAppForbidden';
import {
  getAgent,
  getAiAvatar,
  getAiDubbing,
  getAiEditor,
  // getAiRefresh,
  getAvatarTryOn,
  getHistorys,
  getI2I,
  getI2V,
  getP2V,
  getProducts
} from './menuItems';

export const MenuIds = {
  Home: 'home',
  Production: FoundationMap.Products,
  PostProduction: 'post-production',
  Library: 'library',
  Recommended: 'recommended',
  SceneGenerator: 'scene-generator',
  AvatarVideos: 'avatar-videos',
  P2V: CueMiniApp.P2V,
  AiDubbing: CueMiniApp.AiDubbing,
  AiEditor: CueMiniApp.AiEditor,
  I2V: CueMiniApp.I2V,
  T2V: CueMiniApp.T2V,
  AiAvatar: CueMiniApp.AiAvatar,
  AvatarTryOn: CueMiniApp.AvatarTryOn,
  Canvas: 'canvas',
  Create: 'create',
  Variations: 'variations',
  Inspiration: 'CreativeStudio/Inspiration/Inspiration',
  History: FoundationMap.History,
  Agent: CueMiniApp.VideoAgent
};

export const useDefaultMenuItem = () => {
  const { reset: resetGenerateState } = useGenerateActions();
  // const showAppForbiddenModal = useAppForbiddenModal();
  const miniappPermission = useMiniappPermissionContext();
  const { hasAgentPermission } = useAgentAllowList();
  // const isMounted = useIsMounted();
  const { visitedEditor, visitedAvatar, visitedDubbing, visitedP2V } = useOnboardContext();

  const defaultMenuItems: MenuItem[] = [
    {
      id: MenuIds.Home,
      icon: <KsIconHome size={16} />,
      label: 'Home',
      menuPriority: 100,
      labelKey: 'cue_home_create_menu_home',
      path: '/create',
      exactMatch: true
    },
    {
      id: MenuIds.Inspiration,
      icon: <KsIconTips size={16} />,
      label: 'Inspiration',
      menuPriority: 95,
      showDivider: true,
      labelKey: 'cue_home_create_menu_inspire',
      path: '/inspiration',
      matchPaths: ['/inspiration']
    },
    {
      icon: <KsIconAiGeneration size={16} />,
      menuPriority: 85,
      ...getAgent({ hasAgentPermission })
    },
    {
      id: MenuIds.Create,
      icon: <KsIconVideoCollection size={16} />,
      label: 'Generation',
      menuPriority: 94,
      showDivider: true,
      labelKey: 'cue_home_create_menu_generation',
      children: [getI2V({ miniappPermission }), getI2I({ miniappPermission })]
    },
    {
      id: MenuIds.AvatarVideos,
      icon: <KsIconPeople size={16} />,
      label: 'Avatar Videos',
      menuPriority: 90,
      labelKey: 'cue_home_create_menu_avatar_videos',
      children: [
        getAiAvatar({ visitedAvatar: Boolean(visitedAvatar), miniappPermission }),
        getAvatarTryOn({ miniappPermission })
      ]
    },
    {
      id: MenuIds.Variations,
      icon: <KsIconTransitions size={16} />,
      label: 'Variations',
      menuPriority: 90,
      labelKey: 'cue_home_create_menu_variation',
      showDivider: true,
      children: [
        getP2V({ visitedP2V: Boolean(visitedP2V), resetGenerateState, miniappPermission }),
        getAiDubbing({ miniappPermission, visitedDubbing: Boolean(visitedDubbing) }),
        getAiEditor({ visitedEditor: Boolean(visitedEditor), miniappPermission })
      ]
    },

    getHistorys(),
    getProducts()
  ];
  return defaultMenuItems;
};
