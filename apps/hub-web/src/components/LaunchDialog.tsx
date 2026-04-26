/**
 * [INPUT]: 依赖 React 状态、shared-contracts 启动请求类型与父级传入的启动回调、错误消息和开关状态
 * [OUTPUT]: 对外提供 LaunchDialog 组件，处理绝对路径、cc-viewer 启动参数、错误保留与提交动作
 * [POS]: hub-web 的聚焦层组件，承接 prototype 启动弹窗的交互闭环
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useState } from 'react';
import type { CreateInstanceRequest, LaunchMode } from '@ccv-hub/shared-contracts';

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
  const [projectPath, setProjectPath] = useState('');
  const [mode, setMode] = useState<LaunchMode>('default');
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('');
  const [dangerouslySkipPermissions, setDangerouslySkipPermissions] = useState(false);
  const [allowDangerouslySkipPermissions, setAllowDangerouslySkipPermissions] = useState(false);
  const trimmedPath = projectPath.trim();
  const trimmedPrompt = prompt.trim();
  const trimmedModel = model.trim();
  const canSubmit = trimmedPath.startsWith('/');

  useEffect(() => {
    if (isOpen) {
      setProjectPath('');
      setMode('default');
      setPrompt('');
      setModel('');
      setDangerouslySkipPermissions(false);
      setAllowDangerouslySkipPermissions(false);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={(event) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    }}>
      <div className="modal panel rise" role="dialog" aria-modal="true" aria-labelledby="launchModalTitle">
        <div className="modal-header">
          <div>
            <p className="section-kicker">LAUNCH</p>
            <h3 id="launchModalTitle">启动新的 cc-viewer 实例</h3>
          </div>
          <button className="icon-button" type="button" aria-label="关闭弹窗" onClick={onClose}>✕</button>
        </div>
        <p className="modal-copy">输入真实项目的绝对路径，并按需要带上 cc-viewer 启动参数。</p>
        <label className="path-field">
          <span>项目绝对路径</span>
          <input
            value={projectPath}
            onChange={(event) => setProjectPath(event.target.value)}
            type="text"
            placeholder="输入项目绝对路径"
          />
        </label>
        <div className="launch-options-grid">
          <label className="path-field">
            <span>启动模式</span>
            <select value={mode} onChange={(event) => setMode(event.target.value as LaunchMode)}>
              <option value="default">普通启动</option>
              <option value="continue">继续最近会话 (-c)</option>
              <option value="resume">选择历史会话 (-r)</option>
            </select>
          </label>
          <label className="path-field">
            <span>模型</span>
            <input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              type="text"
              placeholder="例如 claude-sonnet-4-6"
            />
          </label>
        </div>
        <label className="path-field launch-prompt-field">
          <span>初始提示词 (-p)</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="可选，启动后直接发送给 Claude"
            rows={3}
          />
        </label>
        <div className="launch-toggle-stack" aria-label="权限参数">
          <label className="launch-toggle">
            <input
              type="checkbox"
              checked={dangerouslySkipPermissions}
              onChange={(event) => setDangerouslySkipPermissions(event.target.checked)}
            />
            <span>跳过权限确认 (--d)</span>
          </label>
          <label className="launch-toggle">
            <input
              type="checkbox"
              checked={allowDangerouslySkipPermissions}
              onChange={(event) => setAllowDangerouslySkipPermissions(event.target.checked)}
            />
            <span>允许跳过权限确认 (--ad)</span>
          </label>
        </div>
        {errorMessage ? (
          <div className="inline-error">
            <span className="status-led warm"></span>
            <p>{errorMessage}</p>
          </div>
        ) : null}
        <div className="modal-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>关闭</button>
          <button
            className="button button-primary"
            type="button"
            disabled={isSubmitting || !canSubmit}
            onClick={() => void onSubmit({
              projectPath: trimmedPath,
              options: {
                mode,
                prompt: trimmedPrompt,
                model: trimmedModel,
                dangerouslySkipPermissions,
                allowDangerouslySkipPermissions,
              },
            })}
          >
            {isSubmitting ? '启动中…' : '确认启动'}
          </button>
        </div>
      </div>
    </div>
  );
}
