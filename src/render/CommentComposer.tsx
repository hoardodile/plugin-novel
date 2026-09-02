import { MAX_COMMENT_BODY_LENGTH } from "@hoardodile/sdk-types/text-limits"

import { DialogFooterActions } from "@hoardodile/ui/components/app-dialog"
import { Button } from "@hoardodile/ui/components/button"
import { Textarea } from "@hoardodile/ui/components/textarea"
import type { ReactNode } from "react"
import { useState } from "react"
import { useTranslation } from "../i18n"

export type CommentComposerProps = {
	/**
	 * Called when the user submits. The caller owns the mutation,
	 * invalidation, and error/success notification.
	 */
	readonly onSubmit: (body: string) => Promise<unknown>
	readonly isPending?: boolean
	readonly placeholder?: string
	readonly submitLabel?: string
	readonly pendingLabel?: string
	/** Initial body text. */
	readonly initialBody?: string
	/** Optional slot for character/resource pickers (web-specific). */
	readonly pickerSlot?: ReactNode
	readonly testId?: string
	readonly className?: string
}

/**
 * Generic comment composer inside a dialog. Renders the textarea and
 * contributes its submit button to the surrounding dialog's footer action
 * area (via {@link DialogFooterActions}) — no inline submit row and no
 * icon. Outside a dialog the footer contribution is a no-op.
 */
export function CommentComposer(props: CommentComposerProps) {
	const { t } = useTranslation()
	const [body, setBody] = useState(props.initialBody ?? "")
	const isPending = props.isPending ?? false

	function submit() {
		const trimmed = body.trim()
		if (trimmed.length === 0) return
		props.onSubmit(trimmed).then(
			() => setBody(""),
			() => {
				/* caller handles error notification */
			},
		)
	}

	return (
		<div
			className={`flex flex-col gap-2 rounded-lg ${props.className ?? ""}`}
			data-testid={props.testId}
		>
			<Textarea
				value={body}
				onChange={(e) => setBody(e.target.value)}
				maxLength={MAX_COMMENT_BODY_LENGTH}
				placeholder={props.placeholder ?? t("writeComment")}
				rows={3}
				className="min-h-24 resize-y bg-background"
			/>
			{props.pickerSlot}
			<DialogFooterActions>
				<Button
					type="button"
					onClick={submit}
					disabled={isPending || body.trim().length === 0}
				>
					{isPending
						? (props.pendingLabel ?? t("submitting"))
						: (props.submitLabel ?? t("submit"))}
				</Button>
			</DialogFooterActions>
		</div>
	)
}
