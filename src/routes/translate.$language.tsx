import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { loadAllPoFiles, savePoFile } from '#/lib/utils'
import { Input } from '#/components/ui/input'
import { Button } from '#/components/ui/button'
import clsx from 'clsx'

export const Route = createFileRoute('/translate/$language')({
	component: RouteComponent,
})

type Entry = {
	id: string
	source: string
	target: string
}

function RouteComponent() {
	const { language } = Route.useParams()

	const [entries, setEntries] = useState<Entry[]>([])
	const [sessionIds, setSessionIds] = useState<string[]>([])
	const [index, setIndex] = useState(0)
	const [showAll, setShowAll] = useState(false)
	const inputRef = useRef<HTMLInputElement | null>(null)

	const [sourceStore, setSourceStore] = useState<any>(null)
	const [targetStore, setTargetStore] = useState<any>(null)

	useEffect(() => {
		if (!inputRef.current) return
		inputRef.current.focus()
	}, [index, inputRef.current])

	// LOAD
	useEffect(() => {
		const load = async () => {
			const stores = await loadAllPoFiles()

			const source = stores.find(s => s.isSource)
			const target = stores.find(s => s.language === language)

			if (!source || !target) return

			setSourceStore(source)
			setTargetStore(target)

			// build full entry list
			const merged: Entry[] = Object.values(source.entries).map(e => ({
				id: e.id,
				source: e.value || e.id,
				target: target.entries[e.id]?.value ?? '',
			}))

			setEntries(merged)

			// SESSION LIST (fixed at load time)
			const untranslatedIds = merged
				.filter(e => e.target.trim() === '')
				.map(e => e.id)

			setSessionIds(untranslatedIds)
		}

		load()
	}, [language])

	// derived view (NOT stored, NOT recalculated session)
	const visibleEntries = showAll
		? entries
		: entries.filter(e => sessionIds.includes(e.id))

	const current = visibleEntries[index]

	// early exit if source language selected
	if (targetStore?.isSource) {
		return (
			<div className="p-8 text-center text-lg">
				This language is marked as source. Nothing to translate.
			</div>
		)
	}

	if (!current) {
		return <div className="p-8">No messages</div>
	}

	// SAVE + NEXT
	const handleSubmit = async (value: string) => {
		if (!value.trim()) return

		const updatedTarget = {
			...targetStore,
			entries: {
				...targetStore.entries,
				[current.id]: {
					id: current.id,
					value,
				},
			},
		}

		await savePoFile(updatedTarget)
		setTargetStore(updatedTarget)

		// update entries (only data, NOT session)
		const newEntries = entries.map(e =>
			e.id === current.id ? { ...e, target: value } : e
		)

		setEntries(newEntries)

		// find next untranslated in SESSION LIST
		const nextIndex = visibleEntries.findIndex(
			(e, i) => i > index && e.target.trim() === ''
		)

		if (nextIndex !== -1) {
			setIndex(nextIndex)
		} else {
			setIndex(Math.min(index + 1, visibleEntries.length - 1))
		}
	}

	return (
		<div className="flex h-screen">
			{/* LEFT SIDEBAR */}
			<div className="w-64 border-r overflow-y-auto">
				{visibleEntries.map((e, i) => {
					const isTranslated = e.target.trim() !== ''

					return (
						<div
							key={e.id}
							onClick={() => setIndex(i)}
							className={clsx(
								'p-2 cursor-pointer text-sm',
								isTranslated ? 'bg-green-100' : 'bg-red-100',
								i === index && 'border-l-4 border-blue-500'
							)}
						>
							{i + 1}
						</div>
					)
				})}
			</div>

			{/* MAIN */}
			<div className="flex-1 p-6 space-y-4">
				{/* HEADER */}
				<div className="flex justify-between items-center">
					<div className="text-lg font-semibold">
						Message {index + 1}/{visibleEntries.length}
					</div>

					<Button onClick={() => setShowAll(s => !s)}>
						{showAll ? 'Hide translated' : 'Show all'}
					</Button>
				</div>

				{/* SOURCE */}
				<div className="p-4 border rounded-lg bg-muted">
					{current.source}
				</div>

				{/* INPUT */}
				<Input
					ref={inputRef}
					key={current.id}
					defaultValue={current.target}
					placeholder="Enter translation..."
					onKeyDown={e => {
						if (e.key === 'Enter') {
							handleSubmit((e.target as HTMLInputElement).value)
						}
					}}
				/>
			</div>
		</div>
	)
}
