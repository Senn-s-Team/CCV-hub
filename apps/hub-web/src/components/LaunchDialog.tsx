/**
 * [INPUT]: 依赖 React 状态、matchMedia、hub-web API 客户端的宿主机路径能力，依赖 launch 子模块的路径、参数、最近路径与移动端流程组件
 * [OUTPUT]: 对外提供 LaunchDialog 组件，编排桌面/移动同构的路径/参数两段式启动向导、字段错误、提交动作与弹窗生命周期
 * [POS]: hub-web 的启动流程容器，在 OverviewPage 与 components/launch 子模块之间维持单一状态源
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useState } from 'react';
import type { CreateInstanceRequest, HostPathEntry } from '@ccv-hub/shared-contracts';
import LaunchOptions from './launch/LaunchOptions.js';
import LaunchPathStep from './launch/LaunchPathStep.js';
import LaunchWizardFooter from './launch/LaunchWizardFooter.js';
import { LaunchStepRail, type LaunchStep } from './launch/MobileLaunchFlow.js';
import { useLaunchDraft } from './launch/useLaunchDraft.js';
import { useLaunchPathBrowser } from './launch/useLaunchPathBrowser.js';
import { compactPath, mobileLaunchDialogQuery, readIsMobileLaunchDialog } from './launch/launch-dialog-utils.js';

type LaunchDialogProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  errorMessage: string;
  onClose: () => void;
  onSubmit: (request: CreateInstanceRequest) => Promise<void>;
};

export default function LaunchDialog({
  isOpen,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmit,
}: LaunchDialogProps) {
  const draft = useLaunchDraft();
  const pathBrowser = useLaunchPathBrowser();
  const [isMobileSheet, setIsMobileSheet] = useState(() => readIsMobileLaunchDialog());
  const [launchStep, setLaunchStep] = useState<LaunchStep>('path');
  const [manualPathOpen, setManualPathOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia(mobileLaunchDialogQuery);
    const syncMatch = () => setIsMobileSheet(mediaQuery.matches);
    syncMatch();
    mediaQuery.addEventListener?.('change', syncMatch);
    mediaQuery.addListener?.(syncMatch);
    return () => {
      mediaQuery.removeEventListener?.('change', syncMatch);
      mediaQuery.removeListener?.(syncMatch);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    draft.resetDraft();
    pathBrowser.resetPathBrowser();
    setIsMobileSheet(readIsMobileLaunchDialog());
    setLaunchStep('path');
    setManualPathOpen(false);
    setAdvancedOpen(false);
  }, [isOpen]);

  function selectRecentPath(pathname: string) {
    draft.selectPath(pathname, 'recent');
    setLaunchStep('options');
  }

  async function enterDirectory(entry: HostPathEntry, columnIndex: number) {
    if (!isMobileSheet) draft.selectPath(entry.path, 'browser');
    await pathBrowser.loadPath(entry.path, { afterColumn: columnIndex });
  }

  function advanceFromPath() {
    if (draft.canSubmit) {
      setLaunchStep('options');
      return;
    }
    if (pathBrowser.activePath) {
      draft.selectPath(pathBrowser.activePath, 'browser');
      setLaunchStep('options');
    }
  }

  async function submitLaunchRequest() {
    try {
      await onSubmit({
        projectPath: draft.trimmedPath,
        options: {
          mode: draft.mode,
          prompt: draft.trimmedPrompt,
          model: draft.trimmedModel,
          dangerouslySkipPermissions: draft.dangerouslySkipPermissions,
          allowDangerouslySkipPermissions: draft.allowDangerouslySkipPermissions,
        },
      });
      draft.rememberPath(draft.trimmedPath);
    } catch {
      setLaunchStep('options');
    }
  }

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="modal panel rise launch-wizard-modal" role="dialog" aria-modal="true" aria-labelledby="launchModalTitle">
        <div className="modal-header">
          <div>
            <h3 id="launchModalTitle">启动新的 cc-viewer 实例</h3>
            <p className="modal-copy">先选择项目路径，再设置参数并启动。</p>
          </div>
          <button className="icon-button" type="button" aria-label="关闭弹窗" onClick={onClose}>×</button>
        </div>

        <LaunchStepRail step={launchStep} />

        <div className={`launch-dialog-grid launch-wizard-grid${isMobileSheet ? ' launch-mobile-flow' : ''}`}>
          {launchStep === 'path' ? (
            <LaunchPathStep
              projectPath={draft.projectPath}
              manualPathOpen={manualPathOpen}
              pathFieldError={draft.pathFieldError}
              recentPaths={draft.recentPaths}
              roots={pathBrowser.roots}
              columns={pathBrowser.columns}
              activePath={pathBrowser.activePath}
              isBrowsingPaths={pathBrowser.isBrowsingPaths}
              pathBrowserError={pathBrowser.pathBrowserError}
              pathSearch={pathBrowser.pathSearch}
              browserOpen={pathBrowser.browserOpen}
              isMobileSheet={isMobileSheet}
              onManualPathOpenChange={setManualPathOpen}
              onManualPathChange={draft.editManualPath}
              onSelectRecent={selectRecentPath}
              onRemoveRecent={draft.removeRecentPath}
              onOpenBrowser={() => void pathBrowser.openPathBrowser()}
              onPathSearchChange={pathBrowser.setPathSearch}
              onLoadRoot={(pathname) => void pathBrowser.loadPath(pathname, { replace: true })}
              onLoadParent={(pathname) => void pathBrowser.loadPath(pathname, { replace: true })}
              onSelectCurrent={() => pathBrowser.activePath ? draft.selectPath(pathBrowser.activePath, 'browser') : undefined}
              onChooseEntry={(entry) => draft.selectPath(entry.path, 'browser')}
              onEnterEntry={(entry, columnIndex) => void enterDirectory(entry, columnIndex)}
            />
          ) : null}

          {launchStep === 'options' ? (
            <section className="launch-config-panel launch-panel" aria-label="启动配置面板">
              <div className="launch-panel-header">
                <span className="section-kicker">launch</span>
                <h4>启动方式</h4>
                <p className="modal-copy">启动模式与权限开关会直接影响本次会话风险；模型和提示词收在高级设置。</p>
              </div>

              <LaunchOptions
                mode={draft.mode}
                model={draft.model}
                prompt={draft.prompt}
                dangerouslySkipPermissions={draft.dangerouslySkipPermissions}
                allowDangerouslySkipPermissions={draft.allowDangerouslySkipPermissions}
                isMobileSheet={isMobileSheet}
                shouldShowAdvanced={advancedOpen}
                onToggleAdvanced={() => setAdvancedOpen((value) => !value)}
                onModeChange={draft.setMode}
                onModelChange={draft.setModel}
                onPromptChange={draft.setPrompt}
                onDangerouslySkipPermissionsChange={draft.setDangerouslySkipPermissions}
                onAllowDangerouslySkipPermissionsChange={draft.setAllowDangerouslySkipPermissions}
              />
            </section>
          ) : null}

          {!isMobileSheet ? (
            <LaunchSummaryAside path={draft.trimmedPath} sourceLabel={draft.sourceLabel} badges={draft.launchSummaryBadges} />
          ) : null}
        </div>

        <LaunchWizardFooter
          step={launchStep}
          canSubmit={draft.canSubmit}
          hasPathFormatError={draft.hasPathFormatError}
          activePath={pathBrowser.activePath}
          isSubmitting={isSubmitting}
          onClose={onClose}
          errorMessage={errorMessage}
          onBack={() => setLaunchStep('path')}
          onNextPath={advanceFromPath}
          onSubmit={() => void submitLaunchRequest()}
        />
      </div>
    </div>
  );
}

function LaunchSummaryAside({ path, sourceLabel, badges }: { path: string; sourceLabel: string; badges: string[] }) {
  return (
    <aside className="launch-summary-panel launch-panel" aria-label="启动摘要">
      <div className="launch-panel-header">
        <span className="section-kicker">summary</span>
        <h4>将启动</h4>
        <p className="modal-copy">路径与参数会在这里实时同步。点击启动后直接创建实例。</p>
      </div>
      <div className="launch-summary-card">
        <div>
          <span className="section-kicker">项目</span>
          <strong className="launch-summary-path" title={path || undefined}>{path ? compactPath(path) : '等待选择项目'}</strong>
          {path ? <span className="input-hint">{sourceLabel}</span> : null}
        </div>
        <div>
          <span className="section-kicker">参数</span>
          <div className="launch-summary-badges">
            {badges.map((badge) => <span className="chip" key={badge}>{badge}</span>)}
          </div>
        </div>
      </div>
    </aside>
  );
}
