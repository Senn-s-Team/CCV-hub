/**
 * [INPUT]: 依赖 React 状态与父级传入的启动回调、错误消息和开关状态
 * [OUTPUT]: 对外提供 LaunchDialog 组件，处理绝对路径输入、空值占位、错误保留与提交动作
 * [POS]: hub-web 的聚焦层组件，承接 prototype 启动弹窗的交互闭环
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useState } from 'react';

type LaunchDialogProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  errorMessage: string;
  onClose: () => void;
  onSubmit: (projectPath: string) => Promise<void>;
};

export default function LaunchDialog({
  isOpen,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmit,
}: LaunchDialogProps) {
  const [projectPath, setProjectPath] = useState('');
  const trimmedPath = projectPath.trim();
  const canSubmit = trimmedPath.startsWith('/');

  useEffect(() => {
    if (isOpen) {
      setProjectPath('');
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
        <p className="modal-copy">输入真实项目的绝对路径后，在当前上下文内完成启动并回到总览页看结果。</p>
        <label className="path-field">
          <span>项目绝对路径</span>
          <input
            value={projectPath}
            onChange={(event) => setProjectPath(event.target.value)}
            type="text"
            placeholder="输入项目绝对路径"
          />
        </label>
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
            onClick={() => void onSubmit(trimmedPath)}
          >
            {isSubmitting ? '启动中…' : '确认启动'}
          </button>
        </div>
      </div>
    </div>
  );
}
