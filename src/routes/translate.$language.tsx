import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { loadAllPoFiles, savePoFile } from '#/lib/utils'
import { Input } from '#/components/ui/input'
import clsx from 'clsx'
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from '#/components/ui/field'
import { Switch } from '#/components/ui/switch'
import { Badge } from '#/components/ui/badge'
import { ScrollArea, ScrollBar } from '#/components/ui/scroll-area'
import { Textarea } from '#/components/ui/textarea'
import { ArrowLeft } from 'lucide-react'

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
	const inputRef = useRef<HTMLTextAreaElement | null>(null)

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
		<div className="flex flex-col h-screen">
			<div className="flex justify-between items-center border-b border-input px-4 py-2">
				<div className="flex flex-col gap-y-2 shrink">
					<Link className="flex flex-row gap-x-2 items-center w-fit p-2 bg-secondary/20 border border-secondary rounded-lg" to={'/'}><ArrowLeft className="size-4" />home</Link>
					<h1 className="font-bold text-xl">Translating {sourceStore.language.toUpperCase()} to {targetStore.language.toUpperCase()}</h1>
				</div>

				<div>
					<FieldLabel htmlFor="switch-show-all">
						<Field orientation="horizontal">
							<FieldContent>
								<FieldTitle>
									Hide
								</FieldTitle>
								<FieldDescription>
									Hide messages that were translated in a previous session.
								</FieldDescription>
							</FieldContent>
							<Switch onCheckedChange={(v) => setShowAll(!v)} checked={!showAll} id="switch-show-all" />
						</Field>
					</FieldLabel>
				</div>
			</div>
			<div className="flex flex-row h-full">
				<div className="w-64 border-r border-input overflow-y-auto">
					<ScrollArea>
						<ScrollBar orientation="vertical" />
						<div className="w-64 border-r overflow-y-auto">
							{visibleEntries.map((e, i) => {
								const isTranslated = e.target.trim() !== ''

								return (
									<div
										key={e.id}
										onClick={() => setIndex(i)}
										className={clsx(
											'p-2 cursor-pointer text-sm',
											isTranslated ? 'bg-lime-200' : 'bg-red-200',
											i === index && 'border-l-4 border-primary'
										)}
									>
										<p className="truncate">
											{i + 1}. {e.id}
										</p>
									</div>
								)
							})}
						</div>
					</ScrollArea>
				</div>

				{/* MAIN */}
				<div className="flex-1 p-6 space-y-4">
					{/* HEADER */}
					<div className="flex justify-between items-center">
						<h1 className="text-lg font-semibold">
							Message {index + 1}/{visibleEntries.length}
						</h1>
						<Badge variant="outline">{current.id}</Badge>
					</div>

					<div className="space-y-2">
						<p className="text-sm text-muted-foreground">
							Source ({sourceStore.language})
						</p>
						<div className="rounded-lg border border-input p-4 bg-muted/50">
							{current.source}
						</div>
					</div>

					<div className="space-y-2">
						<p className="text-sm text-muted-foreground">
							Translation ({targetStore.language})
						</p>
						<Textarea
							ref={inputRef}
							key={current.id}
							defaultValue={current.target}
							placeholder="Enter translation..."
							spellCheck={false}
							rows={4}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault()
									handleSubmit((e.target as HTMLTextAreaElement).value)
								}
							}}
						/>
					</div>
				</div>
			</div>
		</div>
	)
}
