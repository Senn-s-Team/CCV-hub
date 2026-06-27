/**
 * [INPUT]: 依赖 LaunchDialog 传入的启动阶段
 * [OUTPUT]: 对外提供 LaunchStep 类型与 LaunchStepRail 组件
 * [POS]: components/launch 的阶段导航层，把路径/参数两段式 step rail 从 LaunchDialog 容器中分离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export type LaunchStep = 'path' | 'options';

export function LaunchStepRail({ step }: { step: LaunchStep }) {
  const steps: Array<{ value: LaunchStep; label: string }> = [
    { value: 'path', label: '路径' },
    { value: 'options', label: '参数' },
  ];
  return (
    <div className="launch-step-rail" aria-label="启动步骤">
      {steps.map((item) => <span className={`launch-step-chip${step === item.value ? ' active' : ''}`} key={item.value}>{item.label}</span>)}
    </div>
  );
}
