-- Send an iMessage via the Messages app.
-- Usage: osascript imessage-send.applescript "+15125551234" "message body"
-- Exits 0 on success; nonzero (with error text on stderr) on failure so the
-- caller can treat it as a failed send and surface/log it.
on run argv
	if (count of argv) < 2 then
		error "usage: imessage-send.applescript <phone> <body>"
	end if
	set targetPhone to item 1 of argv
	set messageText to item 2 of argv
	tell application "Messages"
		-- Bind to the iMessage service explicitly (avoids SMS relay ambiguity).
		set imsg to 1st account whose service type = iMessage
		set targetBuddy to participant targetPhone of imsg
		send messageText to targetBuddy
	end tell
end run
