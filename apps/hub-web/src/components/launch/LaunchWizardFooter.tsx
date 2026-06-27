/**
 * [INPUT]: 依赖 MobileLaunchFlow 的 LaunchStep 类型与 LaunchDialog 传入的路径校验、提交状态和动作回调
 * [OUTPUT]: 对外提供 LaunchWizardFooter 组件，渲染两段式启动弹窗的 sticky 底部动作与提交错误
 * [POS]: components/launch 的底部动作条，被 LaunchDialog 放置在路径页和参数页下方
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { LaunchStep } from './MobileLaunchFlow.js';

type LaunchWizardFooterProps = {
  step: LaunchStep;
  canSubmit: boolean;
  hasPathFormatError: boolean;
  activePath: string;
  isSubmitting: boolean;
  errorMessage: string;
  onClose: () => void;
  onBack: () => void;
  onNextPath: () => void;
  onSubmit: () => void;
};

export default function LaunchWizardFooter({ step, canSubmit, hasPathFormatError, activePath, isSubmitting, errorMessage, onClose, onBack, onNextPath, onSubmit }: LaunchWizardFooterProps) {
  const pathActionLabel = canSubmit ? '下一步' : '使用当前目录';
  const pathActionDisabled = hasPathFormatError || (!canSubmit && !activePath);
  return (
    <div className="launch-submit-bar">
      {step === 'path' && hasPathFormatError ? <p className="launch-submit-blocker">路径格式无效，输入绝对路径后再继续</p> : null}
      {step === 'options' && errorMessage ? <p className="launch-submit-blocker">{errorMessage}</p> : null}
      {step === 'path' ? (
        <div className="launch-submit-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>取消</button>
          <button className="button button-primary" type="button" disabled={pathActionDisabled} onClick={onNextPath}>{pathActionLabel}</button>
        </div>
      ) : null}
      {step === 'options' ? (
        <div className="launch-submit-actions">
          <button className="button button-secondary" type="button" onClick={onBack}>上一步</button>
          <button className="button button-primary" type="button" disabled={isSubmitting || !canSubmit} onClick={onSubmit}>{isSubmitting ? '启动中…' : '启动'}</button>
        </div>
      ) : null}
    </div>
  );
}
