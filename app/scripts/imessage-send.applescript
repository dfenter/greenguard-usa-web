-- Send an iMessage via the Messages app.
-- Usage: osascript imessage-send.applescript "+15125551234[,+15125556789,...]" "message body"
-- One phone sends a normal 1:1 iMessage. Multiple comma-separated phones send
-- into the EXISTING group chat whose participants exactly match the list (so a
-- thread Dan has created and named, e.g. "GreenGuard USA", keeps its name and
-- everyone sees replies). macOS removed scriptable group-chat CREATION, so if
-- no matching thread exists yet the script falls back to individual 1:1 sends
-- to every number — create the group once in Messages to upgrade a customer.
-- Exits 0 on success (stdout says which mode); nonzero with error text on
-- stderr on failure so the caller can treat it as a failed send.
-- Optional 3rd arg "nofallback": when no matching group thread exists, error
-- out with NO_GROUP_THREAD instead of sending individually — lets the caller
-- GUI-create the group thread and then not need to send at all (creation
-- itself delivers the message).
on run argv
	if (count of argv) < 2 then
		error "usage: imessage-send.applescript <phone[,phone...]> <body> [nofallback]"
	end if
	set targetPhones to item 1 of argv
	set messageText to item 2 of argv
	set noFallback to false
	if (count of argv) ≥ 3 and item 3 of argv is "nofallback" then set noFallback to true
	set oldDelims to AppleScript's text item delimiters
	set AppleScript's text item delimiters to ","
	set phoneList to text items of targetPhones
	set AppleScript's text item delimiters to oldDelims
	tell application "Messages"
		-- Bind to the iMessage service explicitly (avoids SMS relay ambiguity).
		set imsg to 1st account whose service type = iMessage
		if (count of phoneList) is 1 then
			send messageText to participant (item 1 of phoneList) of imsg
			return "sent-1to1"
		end if
		-- Group: find the existing chat whose participant set matches exactly.
		repeat with c in chats
			set pl to participants of c
			if (count of pl) is (count of phoneList) then
				set matched to true
				repeat with p in pl
					if phoneList does not contain (handle of p) then
						set matched to false
						exit repeat
					end if
				end repeat
				if matched then
					send messageText to c
					return "sent-group"
				end if
			end if
		end repeat
		if noFallback then error "NO_GROUP_THREAD"
		-- No group thread yet: individual sends so nobody misses the message.
		repeat with ph in phoneList
			send messageText to participant (contents of ph) of imsg
		end repeat
		return "sent-individual-fallback"
	end tell
end run
