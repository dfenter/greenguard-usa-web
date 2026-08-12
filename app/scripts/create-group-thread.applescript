-- Create a named iMessage group thread via Messages GUI automation.
-- Usage: osascript create-group-thread.applescript "5125551234,5125556789,..." "first message" "Group Name"
-- The first message may contain \n literals? No — pass real newlines; they are
-- typed as Option+Return so Messages treats them as line breaks, not sends.
-- Also applies the GreenGuard group icon: the icon lives in the Photos library
-- (imported 2026-08-07, media id A160AC13-86A5-4E2D-8CB7-E5A79F5255EC) and
-- appears as the FIRST image in the sheet's Open Gallery view (dateless import
-- sorts to the top). Source file kept at group-icon-greenguard.jpg here.
--
-- Requirements and gotchas (learned 2026-08-07, see memory
-- reference-messages-gui-automation):
-- - Accessibility + Automation permission for the calling process (VS Code).
-- - NOBODY may touch the keyboard/mouse while this runs: keystrokes go to the
--   frontmost app. assertFront aborts rather than typing into other apps.
-- - Works even when the Messages window sits on another Space (runs blind).
-- - The name field swallows early keystrokes while the sheet initializes; type,
--   VERIFY the field value, and retype on mismatch.
-- - Sheet buttons go stale after any click inside the sheet: re-walk
--   `entire contents` before every interaction; retry Done until closed.
on assertFront()
	tell application "System Events"
		set fp to name of first application process whose frontmost is true
		if fp is not "Messages" then error "ABORT: focus stolen by " & fp
	end tell
end assertFront

on clickSheetButton(btnDesc)
	tell application "System Events"
		tell process "Messages"
			set els to entire contents of sheet 1 of window 1
			repeat with e in els
				try
					if role of e is "AXButton" and description of e is btnDesc then
						click e
						return true
					end if
				end try
			end repeat
		end tell
	end tell
	return false
end clickSheetButton

on run argv
	if (count of argv) < 2 then
		error "usage: create-group-thread.applescript <phone,phone,...> <first message> [group name]"
	end if
	set targetPhones to item 1 of argv
	set messageText to item 2 of argv
	-- Group name is optional: with no 3rd arg the script just creates the
	-- thread by sending the message and skips the rename/icon UI entirely
	-- (per Dan 2026-08-07: "instead of changing group name and photo, just
	-- send out the group text").
	set groupName to ""
	if (count of argv) ≥ 3 then set groupName to item 3 of argv
	set oldDelims to AppleScript's text item delimiters
	set AppleScript's text item delimiters to ","
	set phoneList to text items of targetPhones
	set AppleScript's text item delimiters to {return, linefeed}
	set bodyLines to text items of messageText
	set AppleScript's text item delimiters to oldDelims
	if (count of phoneList) < 2 then error "need at least 2 phones for a group"

	-- Normalized handles for post-send verification (participant handles are
	-- E.164: +1XXXXXXXXXX)
	set expectedHandles to {}
	repeat with ph in phoneList
		set digits to ""
		repeat with c in (contents of ph)
			if c is in "0123456789" then set digits to digits & c
		end repeat
		if (count of digits) is 10 then set digits to "1" & digits
		set end of expectedHandles to "+" & digits
	end repeat

	-- Launch/activate Messages and WAIT for the process to actually exist and
	-- come forward. `activate` returns immediately; when Messages was not
	-- already running (or was slow after wake), the following `set frontmost`
	-- hit a process that wasn't ready yet — "Application isn't running" (-600),
	-- seen on the Om 8/12 and Melanie 8/11 reminders.
	tell application "Messages" to activate
	repeat 30 times
		try
			tell application "System Events"
				if exists (process "Messages") then
					if frontmost of process "Messages" then exit repeat
					set frontmost of process "Messages" to true
				end if
			end tell
		end try
		delay 1
	end repeat
	tell application "System Events"
		if not (exists (process "Messages")) then error "MESSAGES_NOT_READY: process never appeared"
		tell process "Messages"
			-- Window must exist before menu-driven compose; after a cold launch
			-- the process is up seconds before its window is.
			repeat 20 times
				if (count of windows) > 0 then exit repeat
				delay 1
			end repeat
			set frontmost to true
			delay 0.5
			click menu item "New Message" of menu 1 of menu bar item "File" of menu bar 1
			delay 1.5
			my assertFront()
			repeat with ph in phoneList
				keystroke (contents of ph)
				delay 1.5
				my assertFront()
				keystroke return
				delay 0.8
			end repeat
			my assertFront()
			keystroke tab
			delay 0.8
			set n to count of bodyLines
			repeat with i from 1 to n
				my assertFront()
				if (item i of bodyLines) is not "" then keystroke (item i of bodyLines)
				delay 0.3
				if i < n then
					keystroke return using option down
					delay 0.3
				end if
			end repeat
			delay 0.5
			-- VERIFY the body landed in the "Message" compose field before sending
			set bodyOK to false
			set msgField to missing value
			set els0 to entire contents of window 1
			repeat with e in els0
				try
					if description of e is "Message" and (value of e) contains (item 1 of bodyLines) then
						set msgField to e
						set bodyOK to true
						exit repeat
					end if
				end try
			end repeat
			if not bodyOK then error "BODY_NOT_TYPED: message text not found in compose field"
			-- Send via the explicit menu command; fall back to Return in the field
			click menu item "Send Message" of menu 1 of menu bar item "Edit" of menu bar 1
			delay 2
			try
				if (value of msgField) contains (item 1 of bodyLines) then
					-- menu send did not clear the field — press Return in it
					set focused of msgField to true
					delay 0.3
					my assertFront()
					keystroke return
					delay 1.5
				end if
			end try
		end tell
	end tell

	-- VERIFY the thread now exists (send actually happened) before touching
	-- any rename UI — renaming without this check can hit the wrong chat.
	-- Wait up to ~90s: a brand-new group can take far longer than the original
	-- 16s to register in the Messages database, especially the first send to a
	-- number that must fall back to SMS relay. The old short timeout reported
	-- SEND_NOT_CONFIRMED for groups that HAD been created, and the caller then
	-- re-sent individually — the duplicate 1:1 texts seen on 8/10 and 8/12.
	set chatFound to false
	repeat 30 times
		tell application "Messages"
			repeat with c in chats
				try
					set pl to participants of c
					if (count of pl) is (count of expectedHandles) then
						set matched to true
						repeat with p in pl
							if expectedHandles does not contain (handle of p) then
								set matched to false
								exit repeat
							end if
						end repeat
						if matched then
							set chatFound to true
							exit repeat
						end if
					end if
				end try
			end repeat
		end tell
		if chatFound then exit repeat
		delay 2
	end repeat
	if not chatFound then error "SEND_NOT_CONFIRMED: no chat with expected participants"
	if groupName is "" then return "created-group"

	tell application "System Events"
		tell process "Messages"
			-- Guard: the active conversation must be the new thread (its title
			-- carries the customer number) before we rename anything.
			set last4 to text -4 thru -1 of (item 1 of expectedHandles)
			if (name of window 1) does not contain last4 then
				error "WRONG_CONVERSATION: window is " & (name of window 1)
			end if

			-- Open Conversation Details (retry: popover is flaky right after a send)
			set pop to missing value
			repeat 4 times
				click menu item "Show Details" of menu 1 of menu bar item "Conversations" of menu bar 1
				delay 2.5
				try
					set pop to pop over 1 of window 1
					exit repeat
				end try
			end repeat
			if pop is missing value then error "details popover never opened"
			set els to entire contents of pop
			repeat with e in els
				try
					if role of e is "AXStaticText" and description of e is "Change Group Name and Photo" then
						click e
						exit repeat
					end if
				end try
			end repeat
			delay 2

			-- Icon: open the gallery, click the FIRST image (the GreenGuard icon)
			set iconApplied to false
			my clickSheetButton("Open Gallery")
			delay 3
			set els2 to entire contents of sheet 1 of window 1
			repeat with e in els2
				try
					if role of e is "AXImage" and description of e starts with "Photo" then
						click e
						set iconApplied to true
						exit repeat
					end if
				end try
			end repeat
			delay 1.5

			-- Name: focus field, type, VERIFY, retype on mismatch
			repeat with attempt from 1 to 3
				set tf to missing value
				set els3 to entire contents of sheet 1 of window 1
				repeat with e in els3
					try
						if role of e is "AXTextField" then
							set tf to e
							exit repeat
						end if
					end try
				end repeat
				if tf is missing value then error "name field not found"
				set focused of tf to true
				delay 0.5
				keystroke "a" using command down
				delay 0.2
				my assertFront()
				keystroke groupName
				delay 0.8
				if (value of tf) is groupName then exit repeat
				if attempt is 3 then error "name field kept mismatching: " & (value of tf)
			end repeat

			-- Done, retried until the sheet actually closes
			repeat 4 times
				my clickSheetButton("Done")
				delay 2
				try
					get sheet 1 of window 1
				on error
					exit repeat
				end try
			end repeat
			try
				get sheet 1 of window 1
				my clickSheetButton("Cancel")
			end try
		end tell
	end tell
	if iconApplied then
		return "created+named+icon: " & groupName
	else
		return "created+named (NO icon found in gallery): " & groupName
	end if
end run
