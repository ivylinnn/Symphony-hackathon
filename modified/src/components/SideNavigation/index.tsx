/* eslint-disable max-lines-per-function */
import { KsDivider, KsDropdownMenu } from '@byted-keystone/react';
import { useTranslation } from '@edenx/runtime/intl';
import { useLocation, useNavigate } from '@edenx/runtime/router';
import {
  KsIconBriefcase,
  KsIconHome,
  KsIconLayout,
  KsIconTips,
  KsIconTransitions
} from '@fe-infra/keystone-icons-react';
import { Folder as IconFolder, SparklesOutline as IconSparklesOutline } from '@okee-fe/react-icons-creative-studio';
import clsx from 'clsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { CueMiniApp, FoundationMap } from '@/const/app';
import { SIDE_NAV_WIDTH_CSS_VAR } from '@/const/layout';
import { MenuIds } from '@/hooks/miniappMenu/useDefaultMenuItem';
import useAgentAllowList from '@/hooks/useAgentAllowList';
import { useTouchAwareTrigger } from '@/hooks/useTouchAwareTrigger';
import { useClickTrack } from '@/tea';
import { MINI_APP_ENTRY_MODULE_NEW, USER_EVENT_TARGET } from '@/tea/event';
import { LogPlatform, PERFORMANCE_EVENT_MAP, pr } from '@/utils/performanceReporter';

import { filterMenuItemsRecursively, type MenuItem, useMenuContext } from '../../hooks/miniappMenu/MenuContext';
import { findMenuItem, flattenMenuItemChildren, getHasSideNavToolsPermission, getSelectedMenuItem } from './utils';

const SIDE_NAV_LABELS: Partial<Record<string, { key: string; defaultValue: string }>> = {
  [MenuIds.Home]: {
    key: 'cue_home_create_menu_home',
    defaultValue: 'Home'
  },
  [MenuIds.Inspiration]: {
    key: 'cue_home_create_menu_inspire',
    defaultValue: 'Inspire'
  },
  [MenuIds.Canvas]: {
    key: 'cue_home_create_menu_canvas',
    defaultValue: 'Canvas'
  },
  [MenuIds.Agent]: {
    key: 'cue_menu_creative_agent',
    defaultValue: 'Agent'
  },
  [MenuIds.Create]: {
    key: 'cue_home_create_menu_create',
    defaultValue: 'Create'
  },
  [MenuIds.History]: {
    key: 'cue_home_create_menu_library',
    defaultValue: 'Library'
  },
  'side-nav-tools': {
    key: 'cue_home_create_menu_tools',
    defaultValue: 'Tools'
  }
};

function SideNavigation({
  className,
  transparentBackground = false
}: {
  className?: string;
  transparentBackground?: boolean;
}) {
  const { menuItems: rawMenuItems } = useMenuContext();
  const navigate = useNavigate();
  const filteredMenuItems = filterMenuItemsRecursively(rawMenuItems);
  const { hasAgentPermission } = useAgentAllowList();
  // 如果不在 agent 白名单，继续沿用旧优先级排序逻辑。
  const menuItems = useMemo(
    () =>
      hasAgentPermission
        ? filteredMenuItems
        : [...filteredMenuItems].sort((a, b) => (b.menuPriority || 0) - (a.menuPriority || 0)),
    [filteredMenuItems, hasAgentPermission]
  );

  const { t } = useTranslation();
  const clickTrack = useClickTrack();
  const menuTrigger = useTouchAwareTrigger();
  const clickMenuOrder = useRef(1);
  const { pathname, search } = useLocation();

  const sideNavItems = useMemo(() => {
    const homeItem = findMenuItem(menuItems, MenuIds.Home);
    const inspirationItem = findMenuItem(menuItems, MenuIds.Inspiration);
    const agentItem = findMenuItem(menuItems, MenuIds.Agent);
    const generationItem = findMenuItem(menuItems, MenuIds.Create);
    const i2vItem = findMenuItem(menuItems, MenuIds.I2V);
    const i2iItem = findMenuItem(menuItems, CueMiniApp.I2I_IMAGE);
    const avatarItem = findMenuItem(menuItems, MenuIds.AvatarVideos);
    const variationsItem = findMenuItem(menuItems, MenuIds.Variations);
    const historyItem = findMenuItem(menuItems, MenuIds.History);
    const productItem = findMenuItem(menuItems, MenuIds.Production);

    const createPath = i2vItem?.path || i2iItem?.path;
    const createItem =
      generationItem && createPath
        ? {
            ...generationItem,
            children: undefined,
            showDivider: false,
            path: createPath,
            pathState: i2vItem?.path ? i2vItem.pathState : i2iItem?.pathState
          }
        : undefined;

    const canvasItem: MenuItem = {
      id: MenuIds.Canvas,
      icon: <KsIconLayout size={20} />,
      label: 'Canvas',
      labelKey: 'cue_home_create_menu_canvas',
      path: '/canvas',
      exactMatch: true
    };

    const toolsChildren = flattenMenuItemChildren([avatarItem, variationsItem]);
    const toolsItem =
      getHasSideNavToolsPermission({ menuItems }) && toolsChildren.length > 0
        ? {
            id: 'side-nav-tools',
            icon: <KsIconBriefcase size={20} />,
            label: 'Tools',
            labelKey: 'cue_home_create_menu_tools',
            showDivider: true,
            children: toolsChildren
          }
        : undefined;

    const libraryItem = historyItem
      ? {
          ...historyItem,
          icon: <IconFolder size={20} />,
          label: 'Library',
          labelKey: 'cue_home_create_menu_library',
          children: undefined
        }
      : undefined;

    return [homeItem, inspirationItem, canvasItem, agentItem, createItem, toolsItem, libraryItem, productItem].filter(
      (item): item is MenuItem => Boolean(item)
    );
  }, [menuItems]);

  const [selectedItem, setSelectedItem] = useState<string>(getSelectedMenuItem(sideNavItems, pathname, search));

  useEffect(() => {
    setSelectedItem(getSelectedMenuItem(sideNavItems, pathname, search));
  }, [pathname, search, sideNavItems]);

  const getItemLabel = (item: MenuItem) => {
    const sideNavLabel = SIDE_NAV_LABELS[item.id];
    if (sideNavLabel) {
      return t(sideNavLabel.key, { defaultValue: sideNavLabel.defaultValue });
    }
    return item.labelKey ? t(item.labelKey, { defaultValue: item.label }) : item.label;
  };

  const navigateMenuItem = (item: MenuItem, event?: React.MouseEvent<HTMLElement>) => {
    event?.preventDefault();
    setSelectedItem(item.id);
    item.onClick?.(event as React.MouseEvent<HTMLDivElement>);
    if (item.path) {
      navigate(item.path, {
        state: item.pathState
      });
    }

    const libraryKey = Object.keys(FoundationMap);
    if (libraryKey.includes(item.id)) {
      clickTrack(USER_EVENT_TARGET.LIBRARY_ENTRY, {
        app: item.id,
        order: clickMenuOrder.current,
        from_module: MINI_APP_ENTRY_MODULE_NEW.HOME_SIDEBAR
      });
    } else {
      clickTrack(USER_EVENT_TARGET.MINI_APP_ENTRY, {
        app: item.id,
        order: clickMenuOrder.current,
        from_module: MINI_APP_ENTRY_MODULE_NEW.HOME_SIDEBAR
      });
      pr.logPerformance(PERFORMANCE_EVENT_MAP.HOME_TIME_TO_ENTER_MINIAPP, undefined, {
        platform: [LogPlatform.TEA, LogPlatform.SLARDAR]
      });
      pr.logPerformance(PERFORMANCE_EVENT_MAP.NEW_USER_HOME_TIME_TO_ENTER_MINIAPP, undefined, {
        platform: [LogPlatform.TEA, LogPlatform.SLARDAR]
      });
      clickMenuOrder.current++;
      pr.markEventStart(PERFORMANCE_EVENT_MAP[item.id]);
    }
  };

  const renderIcon = (item: MenuItem) => {
    const iconClassName = 'text-neutral-fillMedHigh';
    if (item.id === MenuIds.Inspiration) {
      return <KsIconTips size={20} className={iconClassName} />;
    }
    if (item.id === MenuIds.Agent) {
      return <IconSparklesOutline size={20} className={iconClassName} />;
    }
    if (item.id === MenuIds.Canvas) {
      return <KsIconLayout size={20} className={iconClassName} />;
    }
    if (item.id === MenuIds.Create) {
      return <KsIconTransitions size={20} className={iconClassName} />;
    }
    if (item.id === MenuIds.Library) {
      return <IconFolder size={20} className={iconClassName} />;
    }
    if (item.id === MenuIds.Home) {
      return <KsIconHome size={20} className={iconClassName} />;
    }
    if (item.icon && React.isValidElement(item.icon)) {
      return React.cloneElement(item.icon as React.ReactElement, { className: iconClassName });
    }
    return null;
  };

  const renderTrigger = (item: MenuItem, isSelected: boolean) => (
    <button
      type="button"
      className={clsx(
        'bg-transparent flex size-14 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl p-0 p-1 text-neutral-fillMedHigh transition-colors',
        isSelected ? 'bg-primary-surface2' : 'hover:bg-neutral-surfaceHover'
      )}
      onClick={(event) => {
        if (item.children?.length) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        navigateMenuItem(item, event);
      }}
    >
      {renderIcon(item)}
      <span className="max-w-full truncate px-0.5 text-center text-[10px] font-medium leading-[14px]">
        {getItemLabel(item)}
      </span>
    </button>
  );

  const renderDropdownItem = (child: MenuItem) => (
    <div className="flex min-w-[160px] max-w-[240px] items-center gap-2 truncate px-1 py-0.5">
      {child.icon ? <span className="flex size-4 shrink-0 items-center justify-center">{child.icon}</span> : null}
      <span className="truncate text-[14px] leading-[20px]">{getItemLabel(child)}</span>
    </div>
  );

  const renderMenuItem = (item: MenuItem) => {
    const isSelected = selectedItem === item.id;
    const isChildrenSelected = Boolean(item.children?.some((child) => selectedItem === child.id));
    const trigger = renderTrigger(item, isSelected || isChildrenSelected);

    return (
      <React.Fragment key={item.id}>
        {item.children?.length ? (
          <KsDropdownMenu
            className="flex w-full justify-center"
            selectable={false}
            options={item.children.map((child) => ({
              value: child.id,
              label: getItemLabel(child),
              render: () => renderDropdownItem(child)
            }))}
            placement="right-start"
            popoverProps={{
              trigger: menuTrigger,
              gapOffset: 8
            }}
            popupWidth={142}
            onChange={(value: unknown) => {
              const selectedValue = Array.isArray(value) ? value[0] : value;
              const child = item.children?.find((childItem) => childItem.id === selectedValue);
              if (child) {
                navigateMenuItem(child);
              }
            }}
          >
            {trigger}
          </KsDropdownMenu>
        ) : (
          trigger
        )}
        {item.showDivider ? <KsDivider className="my-1 w-9 border-neutral-fillLowInverse" /> : null}
      </React.Fragment>
    );
  };

  return (
    <>
      <div className={clsx('shrink-0', className)} style={{ width: SIDE_NAV_WIDTH_CSS_VAR }} />
      <nav
        className={clsx(
          'grid h-full grid-rows-[1fr_auto_2fr] px-2',
          transparentBackground ? 'bg-transparent' : 'bg-neutral-surface',
          className
        )}
        style={{
          width: SIDE_NAV_WIDTH_CSS_VAR,
          position: 'absolute',
          left: 0,
          top: 0,
          zIndex: 100
        }}
      >
        <div />
        <div className="flex flex-col items-center gap-2">{sideNavItems.map((item) => renderMenuItem(item))}</div>
        <div />
      </nav>
    </>
  );
}

export default SideNavigation;
