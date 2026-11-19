using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace CalendarAPI.Services;

// Settings for sending email, read from the "Email" section of configuration.
// Locally these go in user-secrets; on Azure they are app settings like Email__Host.
public class EmailOptions
{
    public string? Host { get; set; }              // e.g. smtp.gmail.com
    public int Port { get; set; } = 587;
    public string? Username { get; set; }
    public string? Password { get; set; }          // an app password or API key, never your normal password
    public string? FromAddress { get; set; }       // the address emails come from
    public string FromName { get; set; } = "Community Calendar";
}

public interface IEmailSender
{
    // Returns true if the email was handed to the mail server, false if it couldn't be sent.
    Task<bool> SendAsync(string toAddress, string subject, string htmlBody, string textBody, CancellationToken ct = default);
}

public class SmtpEmailSender : IEmailSender
{
    private readonly EmailOptions _options;
    private readonly ILogger<SmtpEmailSender> _logger;

    public SmtpEmailSender(IOptions<EmailOptions> options, ILogger<SmtpEmailSender> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public async Task<bool> SendAsync(string toAddress, string subject, string htmlBody, string textBody, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_options.Host) || string.IsNullOrWhiteSpace(_options.FromAddress))
        {
            _logger.LogWarning("Email isn't set up (Email:Host or Email:FromAddress is missing), so no email was sent to {To}", toAddress);
            return false;
        }

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(_options.FromName, _options.FromAddress));
        message.To.Add(MailboxAddress.Parse(toAddress));
        message.Subject = subject;
        message.Body = new BodyBuilder { HtmlBody = htmlBody, TextBody = textBody }.ToMessageBody();

        try
        {
            using var client = new SmtpClient();
            // Port 465 uses SSL straight away; 587 upgrades to TLS. Auto picks the right one.
            await client.ConnectAsync(_options.Host, _options.Port, SecureSocketOptions.Auto, ct);
            if (!string.IsNullOrEmpty(_options.Username))
                await client.AuthenticateAsync(_options.Username, _options.Password ?? "", ct);
            await client.SendAsync(message, ct);
            await client.DisconnectAsync(true, ct);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Sending email to {To} failed", toAddress);
            return false;
        }
    }
}