import type { UserConfig } from '@commitlint/types'

const config: UserConfig = {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'type-enum': [2, 'always', ['feat', 'fix', 'docs', 'chore', 'refactor', 'perf', 'test', 'build', 'ci', 'revert']],
        'subject-max-length': [2, 'always', 72]
    }
}

export default config
