/**
 * [INPUT]: 依赖 shared-contracts 的 LaunchMode 类型与父级传入的启动参数状态
 * [OUTPUT]: 对外提供 LaunchOptions 组件，默认渲染启动模式与权限开关，并在高级设置中渲染模型与初始提示词
 * [POS]: components/launch 的启动参数步骤，被 LaunchDialog 作为两段式启动向导的参数页
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { LaunchMode } from '@ccv-hub/shared-contracts';

type LaunchOptionsProps = {
  mode: LaunchMode;
  model: string;
  prompt: string;
  dangerouslySkipPermissions: boolean;
  allowDangerouslySkipPermissions: boolean;
  isMobileSheet: boolean;
  shouldShowAdvanced: boolean;
  onToggleAdvanced: () => void;
  onModeChange: (mode: LaunchMode) => void;
  onModelChange: (model: string) => void;
  onPromptChange: (prompt: string) => void;
  onDangerouslySkipPermissionsChange: (checked: boolean) => void;
  onAllowDangerouslySkipPermissionsChange: (checked: boolean) => void;
};

export default function LaunchOptions(props: LaunchOptionsProps) {
  return (
    <div className="launch-config-body">
      <div className="launch-options-grid">
        <label className="path-field">
          <span>启动模式</span>
          <select value={props.mode} onChange={(event) => props.onModeChange(event.target.value as LaunchMode)}>
            <option value="default">普通启动</option>
            <option value="continue">继续最近会话 (-c)</option>
            <option value="resume">选择历史会话 (-r)</option>
          </select>
        </label>
      </div>

      <div className="launch-toggle-stack" aria-label="权限参数">
        <label className="launch-toggle">
          <input type="checkbox" checked={props.dangerouslySkipPermissions} onChange={(event) => props.onDangerouslySkipPermissionsChange(event.target.checked)} />
          <span>跳过权限确认 (--d)</span>
        </label>
        <label className="launch-toggle">
          <input type="checkbox" checked={props.allowDangerouslySkipPermissions} onChange={(event) => props.onAllowDangerouslySkipPermissionsChange(event.target.checked)} />
          <span>允许跳过权限确认 (--ad)</span>
        </label>
      </div>

      <section className="launch-advanced" aria-label="高级设置">
        <button
          className="launch-advanced-toggle"
          type="button"
          aria-expanded={props.shouldShowAdvanced}
          aria-controls="launchAdvancedBody"
          onClick={props.onToggleAdvanced}
        >
          <span>高级设置</span>
          <span className="launch-advanced-state">{props.shouldShowAdvanced ? '收起' : '展开'}</span>
        </button>

        {props.shouldShowAdvanced ? (
          <div className="launch-advanced-body" id="launchAdvancedBody">
            <label className="path-field">
              <span>模型</span>
              <input value={props.model} onChange={(event) => props.onModelChange(event.target.value)} type="text" placeholder="例如 claude-sonnet-4-6" />
            </label>
            <label className="path-field launch-prompt-field">
              <span>初始提示词 (-p)</span>
              <textarea value={props.prompt} onChange={(event) => props.onPromptChange(event.target.value)} placeholder="可选，启动后直接发送给 Claude" rows={props.isMobileSheet ? 4 : 3} />
            </label>
          </div>
        ) : null}
      </section>
    </div>
  );
}
